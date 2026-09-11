import crypto from 'node:crypto';
import { BodyTooLargeError, readBody, readQuery, send, isAdmin, clientIp } from './_lib/util.js';
import { rateLimit } from './_lib/store.js';
import { getSlice } from './_lib/slices.js';
import { addReport, listReports, deleteReport } from './_lib/reports.js';

// Takedown requests. POST is public — anyone looking at the wall can flag a
// photo, including the person in it, who by definition has no pickup code and
// no device token for that post. Requiring any credential here would lock out
// exactly the people the feature exists for.
//
// GET and DELETE are admin-only: the board is where requests get resolved, and
// the count of who-flagged-what is not public information.

// The report body is a slice id and nothing else; anything larger is abuse.
const MAX_BODY_BYTES = 2_000;

// Same device token the wall already generates for self-delete. Only the hash
// is stored — it exists to keep one person from inflating a photo's count, not
// to identify them, so the raw value has no reason to be kept.
const hashDevice = (device) =>
  crypto.createHash('sha256').update(typeof device === 'string' && device ? device : 'anon').digest('hex');

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') return await create(req, res);
    if (req.method === 'GET') return await read(req, res);
    if (req.method === 'DELETE') return await dismiss(req, res);
    return send(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('reports api error:', err);
    return send(res, 500, { error: 'Something went wrong on our end. Please try again.' });
  }
}

// POST /api/reports {sliceId, device} — public takedown request
async function create(req, res) {
  // Tighter than the upload limit: a report costs one small write, but an
  // unthrottled public write endpoint is still a way to fill Redis.
  if (!(await rateLimit(`report:${clientIp(req)}`, 10, 3600))) {
    return send(res, 429, { error: 'Too many requests — give it a few minutes.' });
  }
  if (!(await rateLimit('report:all', 100, 3600))) {
    return send(res, 429, { error: 'Too many requests right now — try again shortly.' });
  }

  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return send(res, 413, { error: 'Invalid request.' });
  }

  let body;
  try { body = await readBody(req, { maxBytes: MAX_BODY_BYTES }); } catch (err) {
    return send(res, err instanceof BodyTooLargeError ? 413 : 400, { error: err instanceof BodyTooLargeError ? 'Invalid request.' : 'Invalid JSON' });
  }

  const sliceId = typeof body.sliceId === 'string' ? body.sliceId : '';
  if (!sliceId) return send(res, 400, { error: 'Invalid id' });

  // Flagging a photo that doesn't exist writes a report nothing can ever
  // resolve — the board would show a row with no image next to it.
  const slice = await getSlice(sliceId);
  if (!slice) return send(res, 404, { error: 'That photo is no longer on the wall.' });

  await addReport(sliceId, hashDevice(body.device));
  // Deliberately no count in the response: how many people flagged a photo is
  // for the admin, and echoing it back would turn this into a way to probe
  // what's already been reported.
  return send(res, 201, { ok: true });
}

// GET /api/reports — admin: open takedown requests, newest activity first.
// Each row carries its photo so the board can show what's actually being
// objected to; the decision is visual, and a list of ids would be useless.
async function read(req, res) {
  if (!isAdmin(req)) return send(res, 401, { error: 'Admin login required' });
  const reports = await listReports();
  if (!reports.length) return send(res, 200, { reports: [] });

  const rows = await Promise.all(reports.map(async (r) => {
    const slice = await getSlice(r.sliceId);
    if (!slice) return null; // photo already gone; drop the stale request
    return {
      sliceId: r.sliceId,
      count: r.count,
      firstAt: r.firstAt,
      lastAt: r.lastAt,
      // Just enough of the photo to judge it. deviceHash/orderId stay server-
      // side here exactly as they do everywhere else a slice is serialized.
      slice: { id: slice.id, url: slice.url, name: slice.name, caption: slice.caption, w: slice.w, h: slice.h, createdAt: slice.createdAt },
    };
  }));
  // `devices` is never returned — it's an anti-inflation mechanism, not
  // something the board needs, and it's derived from a browser token.
  return send(res, 200, { reports: rows.filter(Boolean) });
}

// DELETE /api/reports?sliceId=… — admin dismisses the request, keeping the
// photo. Taking the photo down instead goes through DELETE /api/slices, which
// clears the report on its own; this is the "I looked, it's fine" path.
async function dismiss(req, res) {
  if (!isAdmin(req)) return send(res, 401, { error: 'Admin login required' });
  const { sliceId } = readQuery(req);
  if (!sliceId) return send(res, 400, { error: 'Invalid id' });
  await deleteReport(sliceId);
  return send(res, 200, { ok: true });
}
