import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const blobState = vi.hoisted(() => ({ delImpl: null, listImpl: null }));
vi.mock('@vercel/blob', () => ({
  del: (...args) => blobState.delImpl(...args),
  list: (...args) => blobState.listImpl(...args),
}));

import handler from './cleanup.js';
import { addReport, listReports } from './_lib/reports.js';
import { createSlice, getSlice, SLICE_RETENTION_MS } from './_lib/slices.js';
import { resetEnv, configureBlob } from '../tests/helpers/env.js';
import { startServer, call } from '../tests/helpers/server.js';

let server;
let base;

beforeEach(async () => {
  resetEnv();
  configureBlob();
  process.env.VERCEL = '1';
  process.env.CRON_SECRET = 'cron-test-secret';
  blobState.delImpl = vi.fn(async () => {});
  blobState.listImpl = vi.fn(async () => ({ blobs: [], hasMore: false }));
  server = await startServer({ '/api/cleanup': handler });
  base = server.url;
});

afterEach(async () => { await server.close(); });

const cronCall = () => call(base, '/api/cleanup', {
  headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
});

describe('GET /api/cleanup', () => {
  it('requires the Vercel cron secret in production', async () => {
    expect((await call(base, '/api/cleanup')).status).toBe(401);
    expect((await call(base, '/api/cleanup', { headers: { Authorization: 'Bearer wrong' } })).status).toBe(401);
  });

  it('deletes expired Blobs, metadata, and reports while retaining current posts', async () => {
    const now = Date.now();
    await createSlice({ id: 'old', url: 'https://blob.test/old.jpg', createdAt: now - SLICE_RETENTION_MS - 1 });
    await createSlice({ id: 'current', url: 'https://blob.test/current.jpg', createdAt: now });
    await addReport('old', 'device-hash');

    const result = await cronCall();
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ expired: 1, deleted: 1, failures: [] });
    expect(blobState.delImpl).toHaveBeenCalledWith('https://blob.test/old.jpg', { token: 'test-blob-token' });
    expect(await getSlice('old', { includeExpired: true })).toBeNull();
    expect(await getSlice('current')).not.toBeNull();
    expect(await listReports()).toEqual([]);
  });

  it('retains metadata when Blob deletion fails so a later run can retry', async () => {
    await createSlice({
      id: 'retry', url: 'https://blob.test/retry.jpg',
      createdAt: Date.now() - SLICE_RETENTION_MS - 1,
    });
    blobState.delImpl = vi.fn(async () => { throw new Error('temporary Blob outage'); });

    const result = await cronCall();
    expect(result.status).toBe(207);
    expect(result.body.failures).toEqual(['retry']);
    expect(await getSlice('retry', { includeExpired: true })).not.toBeNull();
  });

  it('deletes an expired orphan Blob left by the former bounded index', async () => {
    const uploadedAt = new Date(Date.now() - SLICE_RETENTION_MS - 1);
    blobState.listImpl = vi.fn(async () => ({
      blobs: [{ url: 'https://blob.test/orphan.jpg', pathname: 'slices/orphan.jpg', uploadedAt }],
      hasMore: false,
    }));
    const result = await cronCall();
    expect(result.status).toBe(200);
    expect(result.body.orphanBlobsDeleted).toBe(1);
    expect(blobState.delImpl).toHaveBeenCalledWith('https://blob.test/orphan.jpg', { token: 'test-blob-token' });
  });
});
