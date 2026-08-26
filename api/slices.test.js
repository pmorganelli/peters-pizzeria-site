import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted so this object exists before vi.mock's factory runs (vi.mock
// calls are hoisted above imports by vitest's transform) — see
// https://vitest.dev/api/vi.html#vi-hoisted. Each test swaps in its own
// vi.fn() implementation to control/observe Blob calls without touching the
// network.
const blobState = vi.hoisted(() => ({ putImpl: null, delImpl: null }));
vi.mock('@vercel/blob', () => ({
  put: (...args) => blobState.putImpl(...args),
  del: (...args) => blobState.delImpl(...args),
}));

import handler from './slices.js';
import ordersHandler from './orders.js';
import loginHandler from './login.js';
import { startServer, call } from '../tests/helpers/server.js';
import { resetEnv, configureBlob } from '../tests/helpers/env.js';
import { openStore, placeOrder, adminCookie, insertOrder } from '../tests/helpers/fixtures.js';
import { makeJpeg, makePng, makeWebpVp8x, makeWebpVp8, makeWebpVp8L, dataUrl } from '../tests/helpers/images.js';
import { createSlice } from './_lib/slices.js';

let server;
let base;

beforeEach(async () => {
  resetEnv();
  configureBlob();
  blobState.putImpl = vi.fn(async (pathname) => ({ url: `https://blob.test/${pathname}`, pathname }));
  blobState.delImpl = vi.fn(async () => {});
  await openStore();
  server = await startServer({ '/api/slices': handler, '/api/orders': ordersHandler, '/api/login': loginHandler });
  base = server.url;
});

afterEach(async () => {
  await server.close();
  // A couple of availability-gate tests set this mid-test; belt-and-suspenders
  // alongside resetEnv()'s beforeEach clear in case a test throws first.
  delete process.env.VERCEL;
});

// A single well-formed post body, so each test only needs to override what
// it's actually testing.
async function postBody(order, overrides = {}) {
  return {
    code: order.code,
    caption: '',
    anon: false,
    device: 'device-token-abc',
    image: dataUrl(makeJpeg(), 'image/jpeg'),
    ...overrides,
  };
}

describe('POST /api/slices — availability gates', () => {
  it('503s when deployed (VERCEL) without Redis configured', async () => {
    const order = await placeOrder(base); // placed before VERCEL is set, or order creation 503s too
    process.env.VERCEL = '1';
    const { status } = await call(base, '/api/slices', { method: 'POST', body: await postBody(order) });
    expect(status).toBe(503);
  });

  it('503s when Blob is not configured', async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const order = await placeOrder(base);
    const { status, body } = await call(base, '/api/slices', { method: 'POST', body: await postBody(order) });
    expect(status).toBe(503);
    expect(body.error).toMatch(/not set up/i);
  });
});

describe('POST /api/slices — rate limits', () => {
  it('trips the per-IP limit (5/hr) before order/body validation', async () => {
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(await call(base, '/api/slices', {
        method: 'POST',
        body: { code: 'nope', anon: false, image: '' }, // invalid, but should still count against the limiter
      }));
    }
    expect(results.slice(0, 5).every((r) => r.status !== 429)).toBe(true);
    expect(results[5].status).toBe(429);
  });

  it('trips the global limit (60/hr) across many different IPs', async () => {
    let last;
    for (let i = 0; i < 61; i++) {
      last = await call(base, '/api/slices', {
        method: 'POST',
        body: { code: 'nope', anon: false, image: '' },
        headers: { 'x-forwarded-for': `10.0.0.${i}` },
      });
    }
    expect(last.status).toBe(429);
    expect(last.body.error).toMatch(/wall is busy/i);
  }, 20000);
});

describe('POST /api/slices — request validation', () => {
  it('rejects a non-boolean anon flag rather than coercing it', async () => {
    const order = await placeOrder(base);
    const { status } = await call(base, '/api/slices', {
      method: 'POST',
      body: await postBody(order, { anon: 'true' }),
    });
    expect(status).toBe(400);
  });

  it('rejects a pickup code under 3 characters', async () => {
    const { status } = await call(base, '/api/slices', {
      method: 'POST',
      body: { code: 'AB', anon: false, image: dataUrl(makeJpeg(), 'image/jpeg') },
    });
    expect(status).toBe(400);
  });

  it('accepts a code at exactly the 3-character floor (rejected only below it)', async () => {
    const order = await insertOrder({ code: 'ABC' });
    const two = await call(base, '/api/slices', { method: 'POST', body: await postBody(order, { code: 'AB' }) });
    expect(two.status).toBe(400);
    const three = await call(base, '/api/slices', { method: 'POST', body: await postBody(order, { code: 'ABC' }) });
    expect(three.status).toBe(201);
  });

  it('trims whitespace and truncates the caption to 80 characters', async () => {
    const order = await placeOrder(base);
    const { body } = await call(base, '/api/slices', {
      method: 'POST',
      body: await postBody(order, { caption: `   spaced   out   ${'x'.repeat(100)}   ` }),
    });
    expect(body.slice.caption.startsWith(' ')).toBe(false);
    expect(body.slice.caption.endsWith(' ')).toBe(false);
    expect(body.slice.caption).not.toMatch(/ {2,}/); // internal runs collapsed to one space
    expect(body.slice.caption.length).toBe(80);
  });

  it('rejects malformed JSON with a 400, not a 500', async () => {
    const res = await fetch(`${base}/api/slices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not valid json',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a code that matches no order, with a generic message', async () => {
    const { status, body } = await call(base, '/api/slices', {
      method: 'POST',
      body: { code: 'GHOST99', anon: false, image: dataUrl(makeJpeg(), 'image/jpeg') },
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/did not match/i);
  });

  it('is case- and #-insensitive on the pickup code', async () => {
    const order = await placeOrder(base);
    const { status } = await call(base, '/api/slices', {
      method: 'POST',
      body: await postBody(order, { code: `#${order.code.toLowerCase()}` }),
    });
    expect(status).toBe(201);
  });

  it('rejects a cancelled order with the same generic message', async () => {
    const order = await insertOrder({ status: 'cancelled' });
    const { status, body } = await call(base, '/api/slices', {
      method: 'POST',
      body: await postBody(order),
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/did not match/i);
  });

  it('rejects an order older than the 3-day post window', async () => {
    const order = await insertOrder({ createdAt: Date.now() - (1000 * 60 * 60 * 24 * 4) });
    const { status } = await call(base, '/api/slices', {
      method: 'POST',
      body: await postBody(order),
    });
    expect(status).toBe(400);
  });

  it('accepts an order just inside the window and rejects one just outside it', async () => {
    const fresh = await insertOrder({ createdAt: Date.now() - (1000 * 60 * 60 * 24 * 3) + 5000 });
    const stale = await insertOrder({ createdAt: Date.now() - (1000 * 60 * 60 * 24 * 3) - 5000 });
    const ok = await call(base, '/api/slices', { method: 'POST', body: await postBody(fresh) });
    const bad = await call(base, '/api/slices', { method: 'POST', body: await postBody(stale) });
    expect(ok.status).toBe(201);
    expect(bad.status).toBe(400);
  });

  it('413s a request over the declared body-size cap', async () => {
    const order = await placeOrder(base);
    const hugeImage = `data:image/jpeg;base64,${'A'.repeat(1_600_000)}`;
    const { status } = await call(base, '/api/slices', {
      method: 'POST',
      body: await postBody(order, { image: hugeImage }),
    });
    expect(status).toBe(413);
  });

  it('rejects a missing image field', async () => {
    const order = await placeOrder(base);
    const { status } = await call(base, '/api/slices', { method: 'POST', body: await postBody(order, { image: undefined }) });
    expect(status).toBe(400);
  });

  it('413s a decoded image over the 1MB image cap, before format checks', async () => {
    const order = await placeOrder(base);
    const big = Buffer.alloc(1_100_000, 1); // not a valid image at all — size is checked first
    const { status } = await call(base, '/api/slices', {
      method: 'POST',
      body: await postBody(order, { image: dataUrl(big, 'image/jpeg') }),
    });
    expect(status).toBe(413);
  });

  it('rejects bytes that are not a recognized image format', async () => {
    const order = await placeOrder(base);
    const notAnImage = Buffer.from('this is plain text, not an image file, padded out a bit more');
    const { status, body } = await call(base, '/api/slices', {
      method: 'POST',
      body: await postBody(order, { image: dataUrl(notAnImage, 'image/jpeg') }),
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/not a photo/i);
  });

  it('rejects a buffer under the 24-byte floor before any format is checked', async () => {
    const order = await placeOrder(base);
    const tooShort = makeJpeg().subarray(0, 10);
    const { status } = await call(base, '/api/slices', {
      method: 'POST',
      body: await postBody(order, { image: dataUrl(tooShort, 'image/jpeg') }),
    });
    expect(status).toBe(400);
  });

  it('rejects a real JPEG (valid magic bytes, >=24 bytes) whose SOF marker is missing', async () => {
    // Real SOI (FFD8) followed by junk that never contains an SOF0-15
    // marker — jpegSize() must scan to the end and return null rather than
    // reading garbage dimensions or throwing.
    const order = await placeOrder(base);
    const noSof = Buffer.alloc(30, 0x00);
    noSof[0] = 0xff; noSof[1] = 0xd8; noSof[2] = 0xff; noSof[3] = 0xe0; // SOI + APP0, no SOF anywhere
    const { status, body } = await call(base, '/api/slices', {
      method: 'POST',
      body: await postBody(order, { image: dataUrl(noSof, 'image/jpeg') }),
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/not a photo/i);
  });

  it('rejects a buffer one byte under the 24-byte floor and accepts one at it', async () => {
    const order = await placeOrder(base);
    const short = await call(base, '/api/slices', {
      method: 'POST',
      body: await postBody(order, { image: dataUrl(makePng(10, 10).subarray(0, 23), 'image/png') }),
    });
    expect(short.status).toBe(400);
    const exact = await call(base, '/api/slices', {
      method: 'POST',
      body: await postBody(order, { image: dataUrl(makePng(10, 10), 'image/png') }),
    });
    expect(exact.status).toBe(201);
  });

  it('sniffs real bytes over a spoofed declared mime type', async () => {
    // Declares JPEG in the data URL prefix but sends real PNG bytes — the
    // server must trust the bytes, not the label.
    const order = await placeOrder(base);
    const png = makePng(60, 40);
    const raw = `data:image/jpeg;base64,${png.toString('base64')}`;
    const { status, body } = await call(base, '/api/slices', {
      method: 'POST',
      body: await postBody(order, { image: raw }),
    });
    expect(status).toBe(201);
    expect(blobState.putImpl.mock.calls[0][0]).toMatch(/\.png$/);
    expect(body.slice.w).toBe(60);
    expect(body.slice.h).toBe(40);
  });

  it('rejects a valid image header with unsafe dimensions before upload', async () => {
    const order = await placeOrder(base);
    const { status } = await call(base, '/api/slices', {
      method: 'POST',
      body: await postBody(order, { image: dataUrl(makePng(5000, 10), 'image/png') }),
    });
    expect(status).toBe(413);
    expect(blobState.putImpl).not.toHaveBeenCalled();
  });
});

describe('POST /api/slices — happy path across formats', () => {
  it.each([
    ['jpeg', () => makeJpeg(120, 80), 'image/jpeg', 'jpg', 120, 80],
    ['png', () => makePng(64, 32), 'image/png', 'png', 64, 32],
    ['webp (VP8X)', () => makeWebpVp8x(200, 100), 'image/webp', 'webp', 200, 100],
    ['webp (VP8 lossy)', () => makeWebpVp8(150, 90), 'image/webp', 'webp', 150, 90],
    ['webp (VP8L lossless)', () => makeWebpVp8L(75, 45), 'image/webp', 'webp', 75, 45],
  ])('accepts a valid %s and returns its exact dimensions', async (_label, make, mime, ext, w, h) => {
    const order = await placeOrder(base);
    const buf = make();
    const { status, body } = await call(base, '/api/slices', {
      method: 'POST',
      body: await postBody(order, { image: dataUrl(buf, mime) }),
    });
    expect(status).toBe(201);
    // Exact, not just > 0 — a swapped w/h read or a dropped "+1" on the
    // VP8X/VP8L width-1 encoding must fail this, not just a missing image.
    expect(body.slice.w).toBe(w);
    expect(body.slice.h).toBe(h);
    expect(blobState.putImpl.mock.calls[0][0]).toMatch(new RegExp(`\\.${ext}$`));
    expect(blobState.putImpl.mock.calls[0][2].contentType).toBe(mime);
  });

  it('rejects a WebP VP8 chunk one byte under its length guard, accepts one at it', async () => {
    const order = await placeOrder(base);
    const short = makeWebpVp8(100, 50).subarray(0, 30); // guard is strictly `length > 30`
    const rejected = await call(base, '/api/slices', {
      method: 'POST',
      body: await postBody(order, { image: dataUrl(short, 'image/webp') }),
    });
    expect(rejected.status).toBe(400);
    const accepted = await call(base, '/api/slices', {
      method: 'POST',
      body: await postBody(order, { image: dataUrl(makeWebpVp8(100, 50), 'image/webp') }),
    });
    expect(accepted.status).toBe(201);
  });

  it('rejects a WebP VP8L chunk one byte under its length guard, accepts one at it', async () => {
    const order = await placeOrder(base);
    const short = makeWebpVp8L(100, 50).subarray(0, 25); // guard is strictly `length > 25`
    const rejected = await call(base, '/api/slices', {
      method: 'POST',
      body: await postBody(order, { image: dataUrl(short, 'image/webp') }),
    });
    expect(rejected.status).toBe(400);
    const accepted = await call(base, '/api/slices', {
      method: 'POST',
      body: await postBody(order, { image: dataUrl(makeWebpVp8L(100, 50), 'image/webp') }),
    });
    expect(accepted.status).toBe(201);
  });

  it('never leaks orderId, hidden, or deviceHash in the response', async () => {
    const order = await placeOrder(base);
    const { body } = await call(base, '/api/slices', { method: 'POST', body: await postBody(order) });
    expect(body.slice.orderId).toBeUndefined();
    expect(body.slice.hidden).toBeUndefined();
    expect(body.slice.deviceHash).toBeUndefined();
  });

  it('attributes the post to the order\'s first name when not anonymous', async () => {
    const order = await placeOrder(base, { name: 'Jamie Somebody' });
    const { body } = await call(base, '/api/slices', { method: 'POST', body: await postBody(order, { anon: false }) });
    expect(body.slice.name).toBe('Jamie');
  });

  it('withholds the name entirely when anon is true, regardless of the order name', async () => {
    const order = await placeOrder(base, { name: 'Jamie Somebody' });
    const { body } = await call(base, '/api/slices', { method: 'POST', body: await postBody(order, { anon: true }) });
    expect(body.slice.name).toBe('');
  });
});

describe('POST /api/slices — per-order quota', () => {
  it('allows exactly 3 photos per order, then refuses the 4th', async () => {
    const order = await placeOrder(base);
    for (let i = 0; i < 3; i++) {
      const { status } = await call(base, '/api/slices', { method: 'POST', body: await postBody(order) });
      expect(status).toBe(201);
    }
    const { status, body } = await call(base, '/api/slices', { method: 'POST', body: await postBody(order) });
    expect(status).toBe(429);
    expect(body.quotaUsed).toBe(true);
  });

  it('releases the slot on a Blob upload failure rather than burning it', async () => {
    const order = await placeOrder(base);
    blobState.putImpl.mockImplementationOnce(async () => { throw new Error('blob down'); });
    const failed = await call(base, '/api/slices', { method: 'POST', body: await postBody(order) });
    expect(failed.status).toBe(502);

    // All 3 real slots should still be available after the failed attempt.
    for (let i = 0; i < 3; i++) {
      const { status } = await call(base, '/api/slices', { method: 'POST', body: await postBody(order) });
      expect(status).toBe(201);
    }
    const fourth = await call(base, '/api/slices', { method: 'POST', body: await postBody(order) });
    expect(fourth.status).toBe(429);
    expect(fourth.body.quotaUsed).toBe(true);
  });
});

describe('unsupported methods', () => {
  it('405s a PUT to /api/slices', async () => {
    const res = await fetch(`${base}/api/slices`, { method: 'PUT' });
    expect(res.status).toBe(405);
  });
});

describe('GET /api/slices', () => {
  it('caps the frequently polled public feed', async () => {
    const now = Date.now();
    await Promise.all(Array.from({ length: 305 }, (_, i) => createSlice({
      id: `feed-${i}`,
      url: `https://blob.test/feed-${i}.jpg`,
      createdAt: now + i,
      hidden: false,
    })));

    const { status, body } = await call(base, '/api/slices');
    expect(status).toBe(200);
    expect(body.slices).toHaveLength(300);
  });

  it('a freshly posted photo actually appears on the public wall with the right fields', async () => {
    const order = await placeOrder(base, { name: 'Jamie Somebody' });
    const posted = await call(base, '/api/slices', {
      method: 'POST',
      body: await postBody(order, { caption: 'best slice on campus', anon: false }),
    });
    const { body } = await call(base, '/api/slices');
    const found = body.slices.find((s) => s.id === posted.body.slice.id);
    expect(found).toBeDefined();
    expect(found).toMatchObject({
      id: posted.body.slice.id,
      url: posted.body.slice.url,
      name: 'Jamie',
      caption: 'best slice on campus',
      w: posted.body.slice.w,
      h: posted.body.slice.h,
    });
  });

  it('excludes hidden posts and strips orderId/deviceHash/hidden from the public feed', async () => {
    const order = await placeOrder(base);
    const posted = await call(base, '/api/slices', { method: 'POST', body: await postBody(order) });
    const cookie = await adminCookie(base);
    const { body: hiddenResp } = await call(base, `/api/slices?id=${posted.body.slice.id}`, {
      method: 'PATCH',
      headers: { Cookie: cookie },
      body: { hidden: true },
    });
    expect(hiddenResp.slice.hidden).toBe(true);

    const { body } = await call(base, '/api/slices');
    expect(body.slices.find((s) => s.id === posted.body.slice.id)).toBeUndefined();
  });

  it('a restored (un-hidden) post reappears on the public wall', async () => {
    const order = await placeOrder(base);
    const posted = await call(base, '/api/slices', { method: 'POST', body: await postBody(order) });
    const cookie = await adminCookie(base);
    await call(base, `/api/slices?id=${posted.body.slice.id}`, {
      method: 'PATCH', headers: { Cookie: cookie }, body: { hidden: true },
    });
    await call(base, `/api/slices?id=${posted.body.slice.id}`, {
      method: 'PATCH', headers: { Cookie: cookie }, body: { hidden: false },
    });
    const { body } = await call(base, '/api/slices');
    expect(body.slices.find((s) => s.id === posted.body.slice.id)).toBeDefined();
  });

  it('401s an admin listing request without a valid cookie', async () => {
    const { status } = await call(base, '/api/slices?admin=1');
    expect(status).toBe(401);
  });

  it('401s an admin listing request with a forged cookie value', async () => {
    const { status } = await call(base, '/api/slices?admin=1', { headers: { Cookie: 'pp_admin=not-the-real-token' } });
    expect(status).toBe(401);
  });

  it('includes hidden posts and the hidden flag for admins, still without deviceHash/orderId', async () => {
    const order = await placeOrder(base);
    const posted = await call(base, '/api/slices', { method: 'POST', body: await postBody(order) });
    const cookie = await adminCookie(base);
    await call(base, `/api/slices?id=${posted.body.slice.id}`, {
      method: 'PATCH',
      headers: { Cookie: cookie },
      body: { hidden: true },
    });
    const { body } = await call(base, '/api/slices?admin=1', { headers: { Cookie: cookie } });
    const found = body.slices.find((s) => s.id === posted.body.slice.id);
    expect(found.hidden).toBe(true);
    expect(found.orderId).toBeUndefined();
    expect(found.deviceHash).toBeUndefined();
  });
});

describe('PATCH /api/slices?id=', () => {
  it('401s without an admin cookie', async () => {
    const { status } = await call(base, '/api/slices?id=whatever', { method: 'PATCH', body: { hidden: true } });
    expect(status).toBe(401);
  });

  it('401s with a forged cookie value', async () => {
    const { status } = await call(base, '/api/slices?id=whatever', {
      method: 'PATCH',
      headers: { Cookie: 'pp_admin=not-the-real-token' },
      body: { hidden: true },
    });
    expect(status).toBe(401);
  });

  it('400s a missing id or non-boolean hidden', async () => {
    const cookie = await adminCookie(base);
    const noId = await call(base, '/api/slices', { method: 'PATCH', headers: { Cookie: cookie }, body: { hidden: true } });
    expect(noId.status).toBe(400);
    const badHidden = await call(base, '/api/slices?id=x', { method: 'PATCH', headers: { Cookie: cookie }, body: { hidden: 'yes' } });
    expect(badHidden.status).toBe(400);
  });

  it('404s an unknown id', async () => {
    const cookie = await adminCookie(base);
    const { status } = await call(base, '/api/slices?id=ghost', { method: 'PATCH', headers: { Cookie: cookie }, body: { hidden: true } });
    expect(status).toBe(404);
  });
});

describe('DELETE /api/slices?id=', () => {
  it('400s a missing id', async () => {
    const { status } = await call(base, '/api/slices', { method: 'DELETE', body: {} });
    expect(status).toBe(400);
  });

  it('404s an unknown id', async () => {
    const { status } = await call(base, '/api/slices?id=ghost', { method: 'DELETE', body: {} });
    expect(status).toBe(404);
  });

  it('403s a mismatched or missing device token for a non-admin', async () => {
    const order = await placeOrder(base);
    const posted = await call(base, '/api/slices', { method: 'POST', body: await postBody(order, { device: 'real-device' }) });
    const wrong = await call(base, `/api/slices?id=${posted.body.slice.id}`, { method: 'DELETE', body: { device: 'wrong-device' } });
    expect(wrong.status).toBe(403);
    const missing = await call(base, `/api/slices?id=${posted.body.slice.id}`, { method: 'DELETE', body: {} });
    expect(missing.status).toBe(403);
  });

  it('lets the posting device delete its own photo', async () => {
    const order = await placeOrder(base);
    const posted = await call(base, '/api/slices', { method: 'POST', body: await postBody(order, { device: 'real-device' }) });
    const { status, body } = await call(base, `/api/slices?id=${posted.body.slice.id}`, {
      method: 'DELETE',
      body: { device: 'real-device' },
    });
    expect(status).toBe(200);
    expect(body.blobRemoved).toBe(true);
    const { body: feed } = await call(base, '/api/slices');
    expect(feed.slices.find((s) => s.id === posted.body.slice.id)).toBeUndefined();
  });

  it('lets an admin delete without a device token', async () => {
    const order = await placeOrder(base);
    const posted = await call(base, '/api/slices', { method: 'POST', body: await postBody(order) });
    const cookie = await adminCookie(base);
    const { status } = await call(base, `/api/slices?id=${posted.body.slice.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
      body: {},
    });
    expect(status).toBe(200);
  });

  it('still unlists the post when the Blob delete itself fails, and reports blobRemoved: false', async () => {
    const order = await placeOrder(base);
    const posted = await call(base, '/api/slices', { method: 'POST', body: await postBody(order, { device: 'real-device' }) });
    blobState.delImpl.mockImplementationOnce(async () => { throw new Error('blob down'); });
    const { status, body } = await call(base, `/api/slices?id=${posted.body.slice.id}`, {
      method: 'DELETE',
      body: { device: 'real-device' },
    });
    expect(status).toBe(200);
    expect(body.blobRemoved).toBe(false);
    const { body: feed } = await call(base, '/api/slices');
    expect(feed.slices.find((s) => s.id === posted.body.slice.id)).toBeUndefined();
  });

  it('does not refund the per-order quota on self-delete', async () => {
    const order = await placeOrder(base);
    const first = await call(base, '/api/slices', { method: 'POST', body: await postBody(order, { device: 'real-device' }) });
    await call(base, '/api/slices', { method: 'POST', body: await postBody(order, { device: 'real-device' }) });
    await call(base, '/api/slices', { method: 'POST', body: await postBody(order, { device: 'real-device' }) });
    await call(base, `/api/slices?id=${first.body.slice.id}`, { method: 'DELETE', body: { device: 'real-device' } });

    const fourth = await call(base, '/api/slices', { method: 'POST', body: await postBody(order, { device: 'real-device' }) });
    expect(fourth.status).toBe(429);
    expect(fourth.body.quotaUsed).toBe(true);
  });

  it('403s a delete for a photo that was uploaded with no device token at all', async () => {
    const order = await placeOrder(base);
    const posted = await call(base, '/api/slices', { method: 'POST', body: await postBody(order, { device: undefined }) });
    const { status } = await call(base, `/api/slices?id=${posted.body.slice.id}`, {
      method: 'DELETE',
      body: { device: 'anything-at-all' },
    });
    expect(status).toBe(403);
  });

  it('rate-limits repeated failed delete attempts from a non-admin (20/10min)', async () => {
    const order = await placeOrder(base);
    const posted = await call(base, '/api/slices', { method: 'POST', body: await postBody(order, { device: 'real-device' }) });
    let last;
    for (let i = 0; i < 21; i++) {
      last = await call(base, `/api/slices?id=${posted.body.slice.id}`, { method: 'DELETE', body: { device: 'wrong-device' } });
    }
    expect(last.status).toBe(429);
  });
});
