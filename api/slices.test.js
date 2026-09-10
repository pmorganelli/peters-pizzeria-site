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
import loginHandler from './login.js';
import { startServer, call } from '../tests/helpers/server.js';
import { resetEnv, configureBlob } from '../tests/helpers/env.js';
import { adminCookie } from '../tests/helpers/fixtures.js';
import { makeJpeg, makePng, makeWebpVp8x, makeWebpVp8, makeWebpVp8L, dataUrl } from '../tests/helpers/images.js';
import { createSlice } from './_lib/slices.js';

let server;
let base;

beforeEach(async () => {
  resetEnv();
  configureBlob();
  blobState.putImpl = vi.fn(async (pathname) => ({ url: `https://blob.test/${pathname}`, pathname }));
  blobState.delImpl = vi.fn(async () => {});
  server = await startServer({ '/api/slices': handler, '/api/login': loginHandler });
  base = server.url;
});

afterEach(async () => {
  await server.close();
  // A couple of availability-gate tests set this mid-test; belt-and-suspenders
  // alongside resetEnv()'s beforeEach clear in case a test throws first.
  delete process.env.VERCEL;
});

// Device tokens the server will accept: the shape check wants 16-128 chars of
// [A-Za-z0-9_-], which the old 'real-device'/'device-token-abc' strings are
// too short for.
const MY_DEVICE = 'device-token-mine-0001';
const OTHER_DEVICE = 'device-token-other-002';

// A single well-formed post body, so each test only needs to override what
// it's actually testing. Posting takes no pickup code any more, so there's no
// order to build one from.
//
// The token varies per call unless a test pins it. It's what the 3-per-day cap
// counts, so a fixed default would quietly 429 the fourth post in any case
// that makes several — turning an unrelated test red for a reason that has
// nothing to do with what it asserts.
let deviceSeq = 0;
function postBody(overrides = {}) {
  deviceSeq += 1;
  return {
    caption: '',
    device: `test-device-${String(deviceSeq).padStart(6, '0')}`,
    image: dataUrl(makeJpeg(), 'image/jpeg'),
    ...overrides,
  };
}

describe('POST /api/slices — availability gates', () => {
  it('503s when deployed (VERCEL) without Redis configured', async () => {
    process.env.VERCEL = '1';
    const { status } = await call(base, '/api/slices', { method: 'POST', body: postBody() });
    expect(status).toBe(503);
  });

  it('503s when Blob is not configured', async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const { status, body } = await call(base, '/api/slices', { method: 'POST', body: postBody() });
    expect(status).toBe(503);
    expect(body.error).toMatch(/not set up/i);
  });
});

describe('POST /api/slices — rate limits', () => {
  it('trips the per-IP limit (5/hr) before token/body validation', async () => {
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(await call(base, '/api/slices', {
        method: 'POST',
        body: { image: '' }, // invalid, but should still count against the limiter
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
        body: { image: '' },
        headers: { 'x-forwarded-for': `10.0.0.${i}` },
      });
    }
    expect(last.status).toBe(429);
    expect(last.body.error).toMatch(/wall is busy/i);
  }, 20000);
});

describe('POST /api/slices — request validation', () => {
  // Posting no longer needs a pickup code, or an order, or anything else that
  // says you bought a pizza. The device token is the one thing a post must
  // carry, and only because the per-device cap is counted on it — a post the
  // server can't attribute to a device is a post it can't limit.
  it('accepts a post with no pickup code and no order behind it', async () => {
    const { status } = await call(base, '/api/slices', { method: 'POST', body: postBody() });
    expect(status).toBe(201);
  });

  it('ignores a pickup code if one is sent anyway', async () => {
    // A page cached from before the change would still send one. It should be
    // inert, not a reason to reject an otherwise fine photo.
    const { status } = await call(base, '/api/slices', {
      method: 'POST',
      body: postBody({ code: 'GHOST' }),
    });
    expect(status).toBe(201);
  });

  it('rejects a post with no device token', async () => {
    const { status, body } = await call(base, '/api/slices', {
      method: 'POST',
      body: postBody({ device: undefined }),
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/posting token/i);
    expect(blobState.putImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['too short', 'abc'],
    ['one under the 16-char floor', 'a'.repeat(15)],
    ['over the 128-char ceiling', 'a'.repeat(129)],
    ['containing characters outside the allowed set', `has spaces ${'x'.repeat(10)}`],
    ['not a string at all', 1234567890123456],
  ])('rejects a device token %s', async (_label, device) => {
    const { status } = await call(base, '/api/slices', { method: 'POST', body: postBody({ device }) });
    expect(status).toBe(400);
  });

  it('accepts a device token at exactly the 16-char floor', async () => {
    const { status } = await call(base, '/api/slices', {
      method: 'POST',
      body: postBody({ device: 'a'.repeat(16) }),
    });
    expect(status).toBe(201);
  });

  it('rejects a bad device token before decoding the image', async () => {
    // The cheapest rejection available should happen first — a junk token
    // shouldn't cost a megabyte of base64 decode. A body carrying both a bad
    // token and an image far over the size cap must come back 400 (the token),
    // not 413 (the image).
    const oversized = Buffer.alloc(1_100_000, 1);
    const { status } = await call(base, '/api/slices', {
      method: 'POST',
      body: postBody({ device: 'nope', image: dataUrl(oversized, 'image/jpeg') }),
    });
    expect(status).toBe(400);
  });

  it('trims whitespace and truncates the caption to 80 characters', async () => {
    const { body } = await call(base, '/api/slices', {
      method: 'POST',
      body: postBody({ caption: `   spaced   out   ${'x'.repeat(100)}   ` }),
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

  it('413s a request over the declared body-size cap', async () => {
    const hugeImage = `data:image/jpeg;base64,${'A'.repeat(1_600_000)}`;
    const { status } = await call(base, '/api/slices', {
      method: 'POST',
      body: postBody({ image: hugeImage }),
    });
    expect(status).toBe(413);
  });

  it('rejects a missing image field', async () => {
    const { status } = await call(base, '/api/slices', { method: 'POST', body: postBody({ image: undefined }) });
    expect(status).toBe(400);
  });

  it('413s a decoded image over the 1MB image cap, before format checks', async () => {
    const big = Buffer.alloc(1_100_000, 1); // not a valid image at all — size is checked first
    const { status } = await call(base, '/api/slices', {
      method: 'POST',
      body: postBody({ image: dataUrl(big, 'image/jpeg') }),
    });
    expect(status).toBe(413);
  });

  it('rejects bytes that are not a recognized image format', async () => {
    const notAnImage = Buffer.from('this is plain text, not an image file, padded out a bit more');
    const { status, body } = await call(base, '/api/slices', {
      method: 'POST',
      body: postBody({ image: dataUrl(notAnImage, 'image/jpeg') }),
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/not a photo/i);
  });

  it('rejects a buffer under the 24-byte floor before any format is checked', async () => {
    const tooShort = makeJpeg().subarray(0, 10);
    const { status } = await call(base, '/api/slices', {
      method: 'POST',
      body: postBody({ image: dataUrl(tooShort, 'image/jpeg') }),
    });
    expect(status).toBe(400);
  });

  it('rejects a real JPEG (valid magic bytes, >=24 bytes) whose SOF marker is missing', async () => {
    // Real SOI (FFD8) followed by junk that never contains an SOF0-15
    // marker — jpegSize() must scan to the end and return null rather than
    // reading garbage dimensions or throwing.
    const noSof = Buffer.alloc(30, 0x00);
    noSof[0] = 0xff; noSof[1] = 0xd8; noSof[2] = 0xff; noSof[3] = 0xe0; // SOI + APP0, no SOF anywhere
    const { status, body } = await call(base, '/api/slices', {
      method: 'POST',
      body: postBody({ image: dataUrl(noSof, 'image/jpeg') }),
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/not a photo/i);
  });

  it('rejects a buffer one byte under the 24-byte floor and accepts one at it', async () => {
    const short = await call(base, '/api/slices', {
      method: 'POST',
      body: postBody({ image: dataUrl(makePng(10, 10).subarray(0, 23), 'image/png') }),
    });
    expect(short.status).toBe(400);
    const exact = await call(base, '/api/slices', {
      method: 'POST',
      body: postBody({ image: dataUrl(makePng(10, 10), 'image/png') }),
    });
    expect(exact.status).toBe(201);
  });

  it('sniffs real bytes over a spoofed declared mime type', async () => {
    // Declares JPEG in the data URL prefix but sends real PNG bytes — the
    // server must trust the bytes, not the label.
    const png = makePng(60, 40);
    const raw = `data:image/jpeg;base64,${png.toString('base64')}`;
    const { status, body } = await call(base, '/api/slices', {
      method: 'POST',
      body: postBody({ image: raw }),
    });
    expect(status).toBe(201);
    expect(blobState.putImpl.mock.calls[0][0]).toMatch(/\.png$/);
    expect(body.slice.w).toBe(60);
    expect(body.slice.h).toBe(40);
  });

  it('rejects a valid image header with unsafe dimensions before upload', async () => {
    const { status } = await call(base, '/api/slices', {
      method: 'POST',
      body: postBody({ image: dataUrl(makePng(5000, 10), 'image/png') }),
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
    const buf = make();
    const { status, body } = await call(base, '/api/slices', {
      method: 'POST',
      body: postBody({ image: dataUrl(buf, mime) }),
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
    const short = makeWebpVp8(100, 50).subarray(0, 30); // guard is strictly `length > 30`
    const rejected = await call(base, '/api/slices', {
      method: 'POST',
      body: postBody({ image: dataUrl(short, 'image/webp') }),
    });
    expect(rejected.status).toBe(400);
    const accepted = await call(base, '/api/slices', {
      method: 'POST',
      body: postBody({ image: dataUrl(makeWebpVp8(100, 50), 'image/webp') }),
    });
    expect(accepted.status).toBe(201);
  });

  it('rejects a WebP VP8L chunk one byte under its length guard, accepts one at it', async () => {
    const short = makeWebpVp8L(100, 50).subarray(0, 25); // guard is strictly `length > 25`
    const rejected = await call(base, '/api/slices', {
      method: 'POST',
      body: postBody({ image: dataUrl(short, 'image/webp') }),
    });
    expect(rejected.status).toBe(400);
    const accepted = await call(base, '/api/slices', {
      method: 'POST',
      body: postBody({ image: dataUrl(makeWebpVp8L(100, 50), 'image/webp') }),
    });
    expect(accepted.status).toBe(201);
  });

  it('never leaks hidden or deviceHash in the response', async () => {
    const { body } = await call(base, '/api/slices', { method: 'POST', body: postBody() });
    expect(body.slice.hidden).toBeUndefined();
    expect(body.slice.deviceHash).toBeUndefined();
  });
});

describe('POST /api/slices — the poster\'s name', () => {
  it('takes the name from the request now that no order supplies one', async () => {
    const { body } = await call(base, '/api/slices', { method: 'POST', body: postBody({ name: 'Jamie' }) });
    expect(body.slice.name).toBe('Jamie');
  });

  it('posts anonymously when the field is left blank', async () => {
    // Blank is the untouched form, so this is the default rather than a
    // setting anyone has to find. It replaces the old anon toggle.
    const empty = await call(base, '/api/slices', { method: 'POST', body: postBody({ name: '' }) });
    expect(empty.body.slice.name).toBe('');
    const absent = await call(base, '/api/slices', { method: 'POST', body: postBody({ name: undefined }) });
    expect(absent.body.slice.name).toBe('');
  });

  it('trims, collapses whitespace, and truncates the name to 20 characters', async () => {
    // The old name came off an order and had already been through intake, so
    // it needed neither. This one is a stranger's free text.
    const { body } = await call(base, '/api/slices', {
      method: 'POST',
      body: postBody({ name: `   Jamie   the   ${'y'.repeat(40)}   ` }),
    });
    expect(body.slice.name.startsWith(' ')).toBe(false);
    expect(body.slice.name.endsWith(' ')).toBe(false);
    expect(body.slice.name).not.toMatch(/ {2,}/);
    expect(body.slice.name.length).toBe(20);
  });

  it('coerces a non-string name rather than storing an object', async () => {
    const { status, body } = await call(base, '/api/slices', {
      method: 'POST',
      body: postBody({ name: { first: 'Jamie' } }),
    });
    expect(status).toBe(201);
    expect(typeof body.slice.name).toBe('string');
  });
});

describe('POST /api/slices — per-device quota', () => {
  it('allows exactly 3 photos from one device, then refuses the 4th', async () => {
    for (let i = 0; i < 3; i++) {
      const { status } = await call(base, '/api/slices', { method: 'POST', body: postBody({ device: MY_DEVICE }) });
      expect(status).toBe(201);
    }
    const { status, body } = await call(base, '/api/slices', { method: 'POST', body: postBody({ device: MY_DEVICE }) });
    expect(status).toBe(429);
    expect(body.quotaUsed).toBe(true);
  });

  it('counts each device separately', async () => {
    // The cap is per device, not a global three-a-day for the whole wall —
    // and postBody()'s rotating default token is what most tests rely on, so
    // this is the case that says the rotation is meaningful.
    for (let i = 0; i < 3; i++) {
      await call(base, '/api/slices', { method: 'POST', body: postBody({ device: MY_DEVICE }) });
    }
    const other = await call(base, '/api/slices', { method: 'POST', body: postBody({ device: OTHER_DEVICE }) });
    expect(other.status).toBe(201);
  });

  it('releases the slot on a Blob upload failure rather than burning it', async () => {
    blobState.putImpl.mockImplementationOnce(async () => { throw new Error('blob down'); });
    const failed = await call(base, '/api/slices', { method: 'POST', body: postBody({ device: MY_DEVICE }) });
    expect(failed.status).toBe(502);

    // All 3 real slots should still be available after the failed attempt.
    for (let i = 0; i < 3; i++) {
      const { status } = await call(base, '/api/slices', { method: 'POST', body: postBody({ device: MY_DEVICE }) });
      expect(status).toBe(201);
    }
    const fourth = await call(base, '/api/slices', { method: 'POST', body: postBody({ device: MY_DEVICE }) });
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
    const posted = await call(base, '/api/slices', {
      method: 'POST',
      body: postBody({ name: 'Jamie', caption: 'best slice on campus' }),
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
    const posted = await call(base, '/api/slices', { method: 'POST', body: postBody() });
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
    const posted = await call(base, '/api/slices', { method: 'POST', body: postBody() });
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
    const posted = await call(base, '/api/slices', { method: 'POST', body: postBody() });
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
    const posted = await call(base, '/api/slices', { method: 'POST', body: postBody({ device: MY_DEVICE }) });
    const wrong = await call(base, `/api/slices?id=${posted.body.slice.id}`, { method: 'DELETE', body: { device: OTHER_DEVICE } });
    expect(wrong.status).toBe(403);
    const missing = await call(base, `/api/slices?id=${posted.body.slice.id}`, { method: 'DELETE', body: {} });
    expect(missing.status).toBe(403);
  });

  it('lets the posting device delete its own photo', async () => {
    const posted = await call(base, '/api/slices', { method: 'POST', body: postBody({ device: MY_DEVICE }) });
    const { status, body } = await call(base, `/api/slices?id=${posted.body.slice.id}`, {
      method: 'DELETE',
      body: { device: MY_DEVICE },
    });
    expect(status).toBe(200);
    expect(body.blobRemoved).toBe(true);
    const { body: feed } = await call(base, '/api/slices');
    expect(feed.slices.find((s) => s.id === posted.body.slice.id)).toBeUndefined();
  });

  it('lets an admin delete without a device token', async () => {
    const posted = await call(base, '/api/slices', { method: 'POST', body: postBody() });
    const cookie = await adminCookie(base);
    const { status } = await call(base, `/api/slices?id=${posted.body.slice.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
      body: {},
    });
    expect(status).toBe(200);
  });

  it('still unlists the post when the Blob delete itself fails, and reports blobRemoved: false', async () => {
    const posted = await call(base, '/api/slices', { method: 'POST', body: postBody({ device: MY_DEVICE }) });
    blobState.delImpl.mockImplementationOnce(async () => { throw new Error('blob down'); });
    const { status, body } = await call(base, `/api/slices?id=${posted.body.slice.id}`, {
      method: 'DELETE',
      body: { device: MY_DEVICE },
    });
    expect(status).toBe(200);
    expect(body.blobRemoved).toBe(false);
    const { body: feed } = await call(base, '/api/slices');
    expect(feed.slices.find((s) => s.id === posted.body.slice.id)).toBeUndefined();
  });

  it('does not refund the per-device quota on self-delete', async () => {
    // The counter is photos posted, not photos currently live. Refunding
    // would make post-delete-repeat an unlimited upload channel — and with
    // the device token now the only thing bounding a poster at all, that loop
    // would undo the cap entirely rather than just one order's share of it.
    const first = await call(base, '/api/slices', { method: 'POST', body: postBody({ device: MY_DEVICE }) });
    await call(base, '/api/slices', { method: 'POST', body: postBody({ device: MY_DEVICE }) });
    await call(base, '/api/slices', { method: 'POST', body: postBody({ device: MY_DEVICE }) });
    await call(base, `/api/slices?id=${first.body.slice.id}`, { method: 'DELETE', body: { device: MY_DEVICE } });

    const fourth = await call(base, '/api/slices', { method: 'POST', body: postBody({ device: MY_DEVICE }) });
    expect(fourth.status).toBe(429);
    expect(fourth.body.quotaUsed).toBe(true);
  });

  it('403s a delete for a photo stored with no device hash at all', async () => {
    // The handler won't accept a tokenless post any more, so this shape can
    // only be seeded — but records written when the token was optional are
    // still on the wall, and ownsSlice()'s null guard is what stops any device
    // at all from claiming one.
    await createSlice({
      id: 'tokenless',
      url: 'https://blob.test/tokenless.jpg',
      pathname: 'tokenless.jpg',
      w: 10, h: 10, name: '', caption: '',
      deviceHash: null,
      createdAt: Date.now(),
      hidden: false,
    });
    const { status } = await call(base, '/api/slices?id=tokenless', {
      method: 'DELETE',
      body: { device: MY_DEVICE },
    });
    expect(status).toBe(403);
  });

  it('rate-limits repeated failed delete attempts from a non-admin (20/10min)', async () => {
    const posted = await call(base, '/api/slices', { method: 'POST', body: postBody({ device: MY_DEVICE }) });
    let last;
    for (let i = 0; i < 21; i++) {
      last = await call(base, `/api/slices?id=${posted.body.slice.id}`, { method: 'DELETE', body: { device: OTHER_DEVICE } });
    }
    expect(last.status).toBe(429);
  });
});
