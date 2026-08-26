import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

// Same Blob mock the slices suite uses — reports are created against real
// uploaded slices, so posting one has to work here too.
const blobState = vi.hoisted(() => ({ putImpl: null, delImpl: null }));
vi.mock('@vercel/blob', () => ({
  put: (...args) => blobState.putImpl(...args),
  del: (...args) => blobState.delImpl(...args),
}));

import reportsHandler from './reports.js';
import slicesHandler from './slices.js';
import ordersHandler from './orders.js';
import loginHandler from './login.js';
import { startServer, call } from '../tests/helpers/server.js';
import { resetEnv, configureBlob } from '../tests/helpers/env.js';
import { openStore, placeOrder, adminCookie } from '../tests/helpers/fixtures.js';
import { makeJpeg, dataUrl } from '../tests/helpers/images.js';

let server;
let base;

beforeEach(async () => {
  resetEnv();
  configureBlob();
  blobState.putImpl = vi.fn(async (pathname) => ({ url: `https://blob.test/${pathname}`, pathname }));
  blobState.delImpl = vi.fn(async () => {});
  await openStore();
  server = await startServer({
    '/api/reports': reportsHandler,
    '/api/slices': slicesHandler,
    '/api/orders': ordersHandler,
    '/api/login': loginHandler,
  });
  base = server.url;
});

afterEach(async () => { await server.close(); });

// Post a real photo to the wall and hand back its id.
async function postSlice(overrides = {}) {
  const order = await placeOrder(base);
  const { body } = await call(base, '/api/slices', {
    method: 'POST',
    body: {
      code: order.code,
      caption: 'a slice',
      anon: false,
      device: 'poster-device',
      image: dataUrl(makeJpeg(), 'image/jpeg'),
      ...overrides,
    },
  });
  return body.slice.id;
}

const report = (sliceId, device = 'viewer-device') =>
  call(base, '/api/reports', { method: 'POST', body: { sliceId, device } });

describe('POST /api/reports — public takedown request', () => {
  it('accepts a request from someone with no order, no code, and no admin cookie', async () => {
    // The whole point: the person in the photo didn't buy the pizza and has
    // no credential of any kind. If this needs auth, the feature is useless.
    const sliceId = await postSlice();
    const { status, body } = await report(sliceId);
    expect(status).toBe(201);
    expect(body.ok).toBe(true);
  });

  it('404s a photo that is not on the wall, rather than storing an unresolvable request', async () => {
    const { status } = await report('s-does-not-exist');
    expect(status).toBe(404);
    const cookie = await adminCookie(base);
    const { body } = await call(base, '/api/reports', { headers: { Cookie: cookie } });
    expect(body.reports).toEqual([]);
  });

  it('400s without a sliceId', async () => {
    const { status } = await call(base, '/api/reports', { method: 'POST', body: { device: 'x' } });
    expect(status).toBe(400);
  });

  it('does not leak the report count back to the public caller', async () => {
    // Echoing the count would turn this endpoint into a way to probe which
    // photos have already been flagged.
    const sliceId = await postSlice();
    await report(sliceId, 'device-a');
    const { body } = await report(sliceId, 'device-b');
    expect(body.count).toBeUndefined();
  });

  it('counts two different devices as two requests', async () => {
    const sliceId = await postSlice();
    await report(sliceId, 'device-a');
    await report(sliceId, 'device-b');
    const cookie = await adminCookie(base);
    const { body } = await call(base, '/api/reports', { headers: { Cookie: cookie } });
    expect(body.reports).toHaveLength(1); // one photo, one row
    expect(body.reports[0].count).toBe(2);
  });

  it('does not lose distinct devices that report simultaneously', async () => {
    const sliceId = await postSlice();
    await Promise.all(Array.from({ length: 8 }, (_, i) => report(sliceId, `device-${i}`)));
    const cookie = await adminCookie(base);
    const { body } = await call(base, '/api/reports', { headers: { Cookie: cookie } });
    expect(body.reports[0].count).toBe(8);
  });

  it('does not let one device inflate the count by reporting repeatedly', async () => {
    const sliceId = await postSlice();
    for (let i = 0; i < 5; i++) await report(sliceId, 'same-device');
    const cookie = await adminCookie(base);
    const { body } = await call(base, '/api/reports', { headers: { Cookie: cookie } });
    expect(body.reports).toHaveLength(1);
    expect(body.reports[0].count).toBe(1);
  });
});

describe('GET /api/reports — admin review queue', () => {
  it('401s without an admin cookie', async () => {
    const sliceId = await postSlice();
    await report(sliceId);
    const { status } = await call(base, '/api/reports');
    expect(status).toBe(401);
  });

  it('is empty when nobody has reported anything', async () => {
    await postSlice();
    const cookie = await adminCookie(base);
    const { status, body } = await call(base, '/api/reports', { headers: { Cookie: cookie } });
    expect(status).toBe(200);
    expect(body.reports).toEqual([]);
  });

  it('carries the photo so the board can show what is being objected to', async () => {
    const sliceId = await postSlice();
    await report(sliceId);
    const cookie = await adminCookie(base);
    const { body } = await call(base, '/api/reports', { headers: { Cookie: cookie } });
    expect(body.reports[0].slice).toMatchObject({ id: sliceId, caption: 'a slice' });
    expect(body.reports[0].slice.url).toContain('https://blob.test/');
  });

  it('never exposes the device hashes or the order id behind a photo', async () => {
    const sliceId = await postSlice();
    await report(sliceId);
    const cookie = await adminCookie(base);
    const { body } = await call(base, '/api/reports', { headers: { Cookie: cookie } });
    expect(body.reports[0].devices).toBeUndefined();
    expect(body.reports[0].slice.deviceHash).toBeUndefined();
    expect(body.reports[0].slice.orderId).toBeUndefined();
  });
});

describe('resolving a request', () => {
  it('dismissing clears the request and leaves the photo up', async () => {
    const sliceId = await postSlice();
    await report(sliceId);
    const cookie = await adminCookie(base);
    const { status } = await call(base, `/api/reports?sliceId=${sliceId}`, { method: 'DELETE', headers: { Cookie: cookie } });
    expect(status).toBe(200);

    const { body: queue } = await call(base, '/api/reports', { headers: { Cookie: cookie } });
    expect(queue.reports).toEqual([]);
    const { body: wall } = await call(base, '/api/slices');
    expect(wall.slices.map((s) => s.id)).toContain(sliceId);
  });

  it('401s a dismiss without an admin cookie, leaving the request in the queue', async () => {
    const sliceId = await postSlice();
    await report(sliceId);
    const { status } = await call(base, `/api/reports?sliceId=${sliceId}`, { method: 'DELETE' });
    expect(status).toBe(401);
    const cookie = await adminCookie(base);
    const { body } = await call(base, '/api/reports', { headers: { Cookie: cookie } });
    expect(body.reports).toHaveLength(1);
  });

  it('taking the photo down also deletes its stored request, with no second call', async () => {
    // Asserted against the store, not the GET response: read() already drops
    // reports whose photo is missing, so checking the queue alone would pass
    // even if the record were never deleted — it would just sit in Redis
    // forever, filtered out on every poll. The record itself has to be gone.
    const sliceId = await postSlice();
    await report(sliceId);
    expect(globalThis.__ppReportStore.has(sliceId)).toBe(true);

    const cookie = await adminCookie(base);
    await call(base, `/api/slices?id=${sliceId}`, { method: 'DELETE', headers: { Cookie: cookie } });

    expect(globalThis.__ppReportStore.has(sliceId)).toBe(false);
    const { body: queue } = await call(base, '/api/reports', { headers: { Cookie: cookie } });
    expect(queue.reports).toEqual([]);
    const { body: wall } = await call(base, '/api/slices');
    expect(wall.slices.map((s) => s.id)).not.toContain(sliceId);
  });

  it('hides a request whose photo vanished by some other path', async () => {
    // A slice can expire (90-day TTL) out from under a live report. The queue
    // has to tolerate that rather than render a row with a dead image.
    const sliceId = await postSlice();
    await report(sliceId);
    globalThis.__ppSliceStore.delete(sliceId); // expiry, without faking the clock
    const cookie = await adminCookie(base);
    const { body } = await call(base, '/api/reports', { headers: { Cookie: cookie } });
    expect(body.reports).toEqual([]);
  });
});

describe('unsupported methods', () => {
  it('405s a PUT to /api/reports', async () => {
    const { status } = await call(base, '/api/reports', { method: 'PUT' });
    expect(status).toBe(405);
  });
});
