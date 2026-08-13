import crypto from 'node:crypto';
import { put, del } from '@vercel/blob';
import { readBody, readQuery, send, isAdmin, clientIp, hasRedisEnv } from './_lib/util.js';
import { listOrders, rateLimit, ORDER_TTL_SECONDS } from './_lib/store.js';
import {
  createSlice, getSlice, listSlices, setSliceHidden, deleteSlice,
  claimSliceQuota, releaseSliceQuota,
} from './_lib/slices.js';
import { deleteReport } from './_lib/reports.js';

const MAX_PER_ORDER = 3;

// A pickup code can only be resolved while its order still exists, and orders
// self-expire after ORDER_TTL_SECONDS (_lib/store.js). Advertising a longer
// window than that would just fail confusingly at the lookup step.
const POST_WINDOW_MS = ORDER_TTL_SECONDS * 1000;

// Encoded payload cap. The client downscales to ~200-400 KB before sending;
// base64 inflates by ~33%, so this leaves generous headroom while keeping the
// buffered body small.
const MAX_BODY_BYTES = 1_500_000;
const MAX_IMAGE_BYTES = 1_000_000;
// {device} is a short token; a DELETE body claiming more than this is abuse.
const MAX_DELETE_BODY_BYTES = 2_000;

// @vercel/blob accepts either a long-lived read/write token or OIDC auth
// (VERCEL_OIDC_TOKEN + BLOB_STORE_ID) — connecting a store through the
// dashboard now provisions the latter. Checking only for the token would
// refuse uploads on a perfectly working OIDC setup. On Vercel the OIDC token
// is injected into the function, so BLOB_STORE_ID alone is enough there.
function blobConfigured() {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
    (process.env.BLOB_STORE_ID && (process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL)),
  );
}

// The SDK resolves OIDC *before* it looks at BLOB_READ_WRITE_TOKEN, so when
// both are configured it silently ignores the token — and fails outright in an
// environment where OIDC isn't enabled. Passing the token explicitly makes the
// intent win. Undefined is ignored by the SDK, so OIDC still applies when
// that's all there is (which is the case on Vercel).
const blobAuth = () =>
  (process.env.BLOB_READ_WRITE_TOKEN ? { token: process.env.BLOB_READ_WRITE_TOKEN } : {});

const CAPTION_MAX = 80;
const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function makeId() {
  return `s${crypto.randomBytes(10).toString('hex')}`;
}

// Posters can delete their own photo, proven by the random token their browser
// generated on first visit. Only the hash is stored: the record is what an
// attacker would be trying to read, and a hash of it is useless for
// impersonation. It never leaves the server in any case.
const hashDevice = (device) => crypto.createHash('sha256').update(device).digest('hex');

function ownsSlice(slice, device) {
  if (!slice.deviceHash || typeof device !== 'string' || !device) return false;
  const provided = Buffer.from(hashDevice(device));
  const expected = Buffer.from(slice.deviceHash);
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(provided, expected);
}

// ── Image sniffing ────────────────────────────────────────────────────
// The declared content type is attacker-controlled; the bytes are what
// actually get served, so the format is decided from the bytes alone. Parsing
// dimensions here doubles as a structural check — a file that claims to be a
// JPEG but has no frame header is not a JPEG.

function jpegSize(buf) {
  let i = 2; // skip SOI
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marker = buf[i + 1];
    // SOF0-SOF15 carry the frame dimensions; C4/C8/CC are DHT/JPG/DAC, not SOF
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

function imageMeta(buf) {
  if (buf.length < 24) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    const size = jpegSize(buf);
    return size ? { mime: 'image/jpeg', ext: 'jpg', ...size } : null;
  }
  if (buf.readUInt32BE(0) === 0x89504e47 && buf.toString('ascii', 12, 16) === 'IHDR') {
    return { mime: 'image/png', ext: 'png', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    // Three sub-formats store dimensions differently; VP8X is the extended
    // container, VP8 lossy, VP8L lossless.
    // Each branch guards its own read: the length check at the top of
    // imageMeta only covers 24 bytes, and these reach past that.
    if (chunk === 'VP8X' && buf.length >= 30) {
      return { mime: 'image/webp', ext: 'webp', w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1 };
    }
    if (chunk === 'VP8 ' && buf.length > 30) {
      return { mime: 'image/webp', ext: 'webp', w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    }
    if (chunk === 'VP8L' && buf.length > 25) {
      const bits = buf.readUInt32LE(21);
      return { mime: 'image/webp', ext: 'webp', w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}

// ── Handler ───────────────────────────────────────────────────────────

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') return await read(req, res);
    if (req.method === 'POST') return await create(req, res);
    if (req.method === 'PATCH') return await patch(req, res);
    if (req.method === 'DELETE') return await remove(req, res);
    return send(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('slices api error:', err);
    return send(res, 500, { error: 'Something went wrong on our end. Please try again.' });
  }
}

// orderId is the upload credential — it must never reach a client. `hidden` is
// dropped too: the public feed only ever contains visible posts, so shipping
// the flag would just invite a client to ask why.
const publicSlice = ({ orderId, hidden, deviceHash, ...rest }) => rest;
// The board needs `hidden` to render the takedown state, but has no use for
// the delete credential — so it doesn't get it either.
const adminSlice = ({ orderId, deviceHash, ...rest }) => rest;

// GET /api/slices        — public wall (visible posts only)
// GET /api/slices?admin=1 — full list including hidden (admin only)
async function read(req, res) {
  const { admin } = readQuery(req);
  if (admin !== undefined) {
    if (!isAdmin(req)) return send(res, 401, { error: 'Admin login required' });
    const all = await listSlices();
    return send(res, 200, { slices: all.map(adminSlice) });
  }
  const all = await listSlices();
  // One pass rather than .filter().map() — the wall can hold 300 records and
  // this runs on every poll from every open tab.
  const visible = [];
  for (const s of all) if (!s.hidden) visible.push(publicSlice(s));
  return send(res, 200, { slices: visible });
}

// POST /api/slices — a customer posts a photo of their slice
async function create(req, res) {
  // Same reasoning as ordering: on Vercel without Redis the post would land in
  // per-instance memory and vanish on the next cold start.
  if (process.env.VERCEL && !hasRedisEnv()) {
    return send(res, 503, { error: 'Posting is temporarily offline — try again a bit later!' });
  }
  if (!blobConfigured()) {
    return send(res, 503, { error: 'Photo posting is not set up yet — check back soon!' });
  }

  // Rate limits run before the body is read: the point is to reject a flood
  // without buffering its payload first.
  if (!(await rateLimit(`slice:${clientIp(req)}`, 5, 3600))) {
    return send(res, 429, { error: 'That is a lot of slice pics — give it an hour and try again.' });
  }
  if (!(await rateLimit('slice:all', 60, 3600))) {
    return send(res, 429, { error: 'The wall is busy right now — try again in a few minutes.' });
  }

  // Reject oversized payloads on the declared length, before a single chunk is
  // buffered. readBody() reads the whole stream with no byte accounting.
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return send(res, 413, { error: 'That photo is too large — try a smaller one.' });
  }

  let body;
  try { body = await readBody(req); } catch { return send(res, 400, { error: 'Invalid JSON' }); }

  // Reject a non-boolean rather than coercing it. Guessing is wrong in both
  // directions here: treat a stray truthy value as false and someone who asked
  // to be anonymous gets named; treat it as true and someone loses the credit
  // they wanted. Neither is worth a silent wrong answer about a person's name.
  if (body.anon !== undefined && typeof body.anon !== 'boolean') {
    return send(res, 400, { error: 'Invalid post-as setting — refresh and try again.' });
  }

  // Validated before the pickup code is even looked up: if a bad file produced
  // a different error than a bad code, that difference would let an attacker
  // probe which codes are real without ever needing a working photo.
  const raw = typeof body.image === 'string' ? body.image : '';
  const base64 = raw.startsWith('data:') ? raw.slice(raw.indexOf(',') + 1) : raw;
  if (!base64 || base64.length > MAX_BODY_BYTES) {
    return send(res, 400, { error: 'We could not read that photo — try picking it again.' });
  }

  let buf;
  try { buf = Buffer.from(base64, 'base64'); } catch { buf = null; }
  if (!buf || buf.length === 0) {
    return send(res, 400, { error: 'We could not read that photo — try picking it again.' });
  }
  if (buf.length > MAX_IMAGE_BYTES) {
    return send(res, 413, { error: 'That photo is too large — try a smaller one.' });
  }

  const meta = imageMeta(buf);
  if (!meta || !meta.w || !meta.h) {
    return send(res, 400, { error: 'That file is not a photo we can display (JPEG, PNG or WebP only).' });
  }

  const code = clean(body.code, 12).replace(/^#/, '').toUpperCase();
  if (code.length < 3) return send(res, 400, { error: 'Enter the pickup code from your order.' });

  // Exact code match only — never by name. The `find` lookup in orders.js
  // matches names too, which is fine for reading your own status but would let
  // anyone post as anyone here.
  const orders = await listOrders();
  const order = orders.find((o) => o.code?.toUpperCase() === code);
  const tooOld = order && Date.now() - order.createdAt > POST_WINDOW_MS;
  // One generic message for missing / expired / cancelled, so the endpoint
  // can't be used to probe which pickup codes are real.
  if (!order || tooOld || order.status === 'cancelled') {
    return send(res, 400, { error: 'That pickup code did not match a recent order.' });
  }

  // Claim the slot before uploading so two parallel requests can't both take
  // the last one; released again if anything downstream fails.
  const { ok, count } = await claimSliceQuota(order.id, MAX_PER_ORDER);
  if (!ok) {
    return send(res, 429, {
      error: `This order has already posted its ${MAX_PER_ORDER} photos — thanks for sharing!`,
      quotaUsed: true,
    });
  }

  const id = makeId();
  let blob;
  try {
    blob = await put(`slices/${id}.${meta.ext}`, buf, {
      access: 'public',
      contentType: meta.mime,     // explicit — vercel.json sends nosniff sitewide
      addRandomSuffix: true,      // the URL itself is unguessable
      cacheControlMaxAge: 31536000,
      ...blobAuth(),
    });
  } catch (err) {
    await releaseSliceQuota(order.id);
    console.error('blob upload failed:', err);
    return send(res, 502, { error: 'Could not save that photo — please try again.' });
  }

  const slice = {
    id,
    url: blob.url,
    pathname: blob.pathname,
    w: meta.w,
    h: meta.h,
    // The name always comes from the order, never from the request body, so it
    // needs no sanitising and can't be spoofed. The body only gets a say in
    // whether to show it at all. Strict === true, so a missing or junk value
    // falls back to attributed rather than silently anonymising someone.
    name: body.anon === true ? '' : (order.name || '').split(' ')[0],
    caption: clean(body.caption, CAPTION_MAX),
    orderId: order.id,
    // Absent if the client sent no device token — that post simply isn't
    // self-deletable, rather than being deletable by anyone.
    deviceHash: typeof body.device === 'string' && body.device ? hashDevice(body.device) : null,
    createdAt: Date.now(),
    // Posts go live the moment they're uploaded — moderation is take-down
    // (DELETE) only, from the community pictures page itself, not a
    // pre-publish approval queue.
    hidden: false,
  };

  try {
    await createSlice(slice);
  } catch (err) {
    await releaseSliceQuota(order.id);
    await del(blob.url, blobAuth()).catch(() => { /* orphaned blob is better than a 500 */ });
    throw err;
  }

  return send(res, 201, { slice: publicSlice(slice), remaining: MAX_PER_ORDER - count });
}

// PATCH /api/slices?id=… {hidden} — admin hides or restores a post
async function patch(req, res) {
  if (!isAdmin(req)) return send(res, 401, { error: 'Admin login required' });
  const { id } = readQuery(req);
  let body;
  try { body = await readBody(req); } catch { return send(res, 400, { error: 'Invalid JSON' }); }
  if (!id || typeof body.hidden !== 'boolean') return send(res, 400, { error: 'Invalid id or hidden flag' });
  const slice = await setSliceHidden(id, body.hidden);
  if (!slice) return send(res, 404, { error: 'Post not found' });
  return send(res, 200, { slice: adminSlice(slice) });
}

// DELETE /api/slices?id=… — removes a post and its stored image.
// Admins can remove anything; a poster can remove their own, proving it with
// the device token their browser sent when the photo was uploaded.
async function remove(req, res) {
  const { id } = readQuery(req);
  if (!id) return send(res, 400, { error: 'Invalid id' });

  const admin = isAdmin(req);
  // The token is 128 bits of randomness, so guessing is hopeless — but a cap
  // keeps anyone from hammering this endpoint trying.
  if (!admin && !(await rateLimit(`slicedel:${clientIp(req)}`, 20, 600))) {
    return send(res, 429, { error: 'Too many attempts — give it a minute.' });
  }

  const slice = await getSlice(id);
  if (!slice) return send(res, 404, { error: 'Post not found' });

  if (!admin) {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_DELETE_BODY_BYTES) {
      return send(res, 413, { error: 'Invalid request.' });
    }
    let body = {};
    try { body = await readBody(req); } catch { /* no credential; fails below */ }
    if (!ownsSlice(slice, body.device)) {
      return send(res, 403, { error: 'That photo was posted from a different device.' });
    }
  }
  // Delete the blob first, so a transient failure leaves the post listed and
  // still deletable rather than orphaning an unreachable image. But a
  // *persistent* Blob failure — rotated token, store deleted out from under
  // records that live 90 days — would otherwise make every post permanently
  // undeletable, taking down the only way to pull an offensive photo. So a
  // failure still unlists the record: an orphaned blob at an unguessable URL
  // beats a wall nobody can moderate. The caller is told which happened.
  let blobRemoved = true;
  if (slice.url) {
    try {
      await del(slice.url, blobAuth());
    } catch (err) {
      blobRemoved = false;
      console.error('blob delete failed — unlisting the post anyway:', err);
    }
  }
  await deleteSlice(id);
  // Taking the photo down resolves any takedown request against it — leaving
  // the report would keep the request sitting on the admin board pointing at
  // a photo that no longer exists, which GET /api/reports would then have to
  // filter out on every poll.
  await deleteReport(id);
  // Deliberately no releaseSliceQuota() here: the per-order limit counts photos
  // posted, not photos currently live. Giving the slot back would turn
  // post-delete-repeat into an unlimited upload channel.
  return send(res, 200, { ok: true, blobRemoved });
}
