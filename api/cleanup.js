import { del, list as listBlobs } from '@vercel/blob';
import { send } from './_lib/util.js';
import {
  deleteSlice, listSlices, preserveSliceMetadata, SLICE_RETENTION_MS,
} from './_lib/slices.js';
import { deleteReport } from './_lib/reports.js';

const blobAuth = () =>
  (process.env.BLOB_READ_WRITE_TOKEN ? { token: process.env.BLOB_READ_WRITE_TOKEN } : {});

function authorized(req) {
  if (!process.env.VERCEL && !process.env.CRON_SECRET) return true;
  return Boolean(process.env.CRON_SECRET) && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
  if (!authorized(req)) return send(res, 401, { error: 'Unauthorized' });

  const now = Date.now();
  const found = await listSlices({ includeExpired: true, now });
  const slices = await Promise.all(found.map(preserveSliceMetadata));
  const expired = slices.filter((slice) => (slice.expiresAt ?? slice.createdAt + SLICE_RETENTION_MS) <= now);
  let deleted = 0;
  let orphanBlobsDeleted = 0;
  const failures = [];
  const removedUrls = new Set();

  for (const slice of expired) {
    try {
      if (slice.url) await del(slice.url, blobAuth());
      if (slice.url) removedUrls.add(slice.url);
      await deleteSlice(slice.id);
      await deleteReport(slice.id);
      deleted += 1;
    } catch (err) {
      console.error(`cleanup failed for slice ${slice.id}:`, err);
      failures.push(slice.id);
    }
  }

  // The former slice index kept only 300 ids, so very old deployments can
  // have Blobs whose metadata is no longer enumerable. Scan the Blob prefix as
  // a second safety net, protecting every URL that still has current metadata.
  const expiredIds = new Set(expired.map((slice) => slice.id));
  const protectedUrls = new Set(
    slices.filter((slice) => !expiredIds.has(slice.id)).map((slice) => slice.url).filter(Boolean),
  );
  let cursor;
  try {
    do {
      const page = await listBlobs({ prefix: 'slices/', limit: 1000, cursor, ...blobAuth() });
      for (const blob of page.blobs) {
        const uploadedAt = new Date(blob.uploadedAt).getTime();
        if (uploadedAt <= now - SLICE_RETENTION_MS && !protectedUrls.has(blob.url) && !removedUrls.has(blob.url)) {
          await del(blob.url, blobAuth());
          removedUrls.add(blob.url);
          orphanBlobsDeleted += 1;
        }
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  } catch (err) {
    console.error('cleanup Blob scan failed:', err);
    failures.push('blob-scan');
  }

  return send(res, failures.length ? 207 : 200, {
    scanned: slices.length, expired: expired.length, deleted, orphanBlobsDeleted, failures,
  });
}
