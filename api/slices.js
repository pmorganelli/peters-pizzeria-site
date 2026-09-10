import crypto from 'node:crypto';
import { put, del } from '@vercel/blob';
import { BodyTooLargeError, readBody, readQuery, send, isAdmin, clientIp, hasRedisEnv } from './_lib/util.js';
import { rateLimit } from './_lib/store.js';
import {
  createSlice, getSlice, listSlices, setSliceHidden, deleteSlice,
  claimSliceQuota, releaseSliceQuota,
} from './_lib/slices.js';
import { deleteReport } from './_lib/reports.js';

// ── Posting limits ────────────────────────────────────────────────────
// Posting used to require an exact pickup code from a real, recent,
// non-cancelled order: the wall was for customers, and the code was the proof
// that you were one. It doesn't any more — anyone who can see the wall can
// post to it.
//
// That removed the only *hard* per-person cap the feature had, so what stands
// in for it is deliberately soft. This counter keys on the random token the
// browser keeps in localStorage, which anyone determined can clear. It is not
// an identity and isn't trying to be one; it's a speed bump that stops one
// person idly dumping twenty photos out of a single session. The real
// backstops are the per-IP and global rate limits below, plus admin take-down
// after the fact.
const MAX_PER_DEVICE = 3;
const DEVICE_WINDOW_S = 60 * 60 * 24;

// Encoded payload cap. The client downscales to ~200-400 KB before sending;
// base64 inflates by ~33%, so this leaves generous headroom while keeping the
// buffered body small.
const MAX_BODY_BYTES = 1_500_000;
const MAX_IMAGE_BYTES = 1_000_000;
const MAX_IMAGE_EDGE = 4_096;
const MAX_IMAGE_PIXELS = 16_000_000;
// {device} is a short token; a DELETE body claiming more than this is abuse.
const MAX_DELETE_BODY_BYTES = 2_000;
// The wall polls every few seconds from every visible tab. Bound both the
// Redis work and response/render size while retaining the complete index for
// cleanup and authenticated moderation.
const PUBLIC_FEED_LIMIT = 300;

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
// The poster's name is self-declared now. The old one came off the order the
// pickup code resolved to, which is why it needed neither a cap nor
// sanitising — it had already been through order intake. This one is a
// stranger's free text, so it gets both.
const NAME_MAX = 20;
const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// The device token is a localStorage value, so it reaches Redis as part of a
// key. Pin the shape rather than hashing whatever arrives: the client writes
// 32 hex characters, and the range leaves room to change that without a
// server deploy while refusing anything long enough to be an attack on the
// keyspace.
const DEVICE_TOKEN = /^[A-Za-z0-9_-]{16,128}$/;

function makeId() {
  return `s${crypto.randomBytes(10).toString('hex')}`;
}

// Posters can delete their own photo, proven by the random token their browser
// generated on first visit. Only the hash is stored: the record is what an
// attacker would be trying to read, and a hash of it is useless for
// impersonation. It never leaves the server in any case. The same hash is
// what the per-device post counter is keyed on.
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

// New posts carry no orderId — nothing ties a photo to an order any more. The
// destructure stays because records written while the pickup code *was* the
// credential live on the wall for 90 days, and it is the only thing keeping
// one of those order ids out of a public response. Don't tidy it away (same
// deal as `contact` in api/orders.js). `hidden` is dropped too: the public
// feed only ever contains visible posts, so shipping the flag would just
// invite a client to ask why.
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
  const all = await listSlices({ limit: PUBLIC_FEED_LIMIT });
  // One pass rather than .filter().map() — this runs on every poll from every
  // open tab. Hidden posts count toward the scan cap, which keeps work bounded
  // even if moderation hides a large burst of recent uploads.
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

  // Reject oversized declared bodies immediately; readBody() also counts the
  // stream so chunked requests cannot bypass the same cap.
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return send(res, 413, { error: 'That photo is too large — try a smaller one.' });
  }

  let body;
  try { body = await readBody(req, { maxBytes: MAX_BODY_BYTES }); } catch (err) {
    return send(res, err instanceof BodyTooLargeError ? 413 : 400, {
      error: err instanceof BodyTooLargeError ? 'That photo is too large — try a smaller one.' : 'Invalid JSON',
    });
  }

  // The device token is required now, where it used to be optional. It was a
  // convenience then — a post without one simply wasn't self-deletable — but
  // it is what the per-device counter is keyed on, so a post arriving without
  // one would be uncountable, and therefore unlimited. Requiring it also means
  // every post is deletable by whoever made it, which is the only self-service
  // remedy left now that no order stands behind a photo.
  //
  // Checked here, before the image is decoded, because it's the cheapest
  // rejection available: a bad token shouldn't cost a megabyte of base64.
  // (The image used to be validated first, so that a bad file and a bad pickup
  // code couldn't be told apart by their error — with no code to probe, that
  // ordering has nothing left to protect.)
  // Typed check, not `String(body.device)`: a JSON number of the right length
  // coerces to a string that satisfies the pattern, and hashDevice() would
  // then hand a number to crypto's update(), which throws — turning a
  // malformed request into a 500.
  const device = typeof body.device === 'string' ? body.device : '';
  if (!DEVICE_TOKEN.test(device)) {
    return send(res, 400, { error: 'Your browser did not send a posting token — reload the page and try again.' });
  }
  const deviceHash = hashDevice(device);

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
  if (meta.w > MAX_IMAGE_EDGE || meta.h > MAX_IMAGE_EDGE || meta.w * meta.h > MAX_IMAGE_PIXELS) {
    return send(res, 413, { error: 'That photo has dimensions that are too large — try a smaller one.' });
  }

  // Claim the slot before uploading so two parallel requests can't both take
  // the last one; released again if anything downstream fails.
  const { ok, count } = await claimSliceQuota(`dev:${deviceHash}`, MAX_PER_DEVICE, DEVICE_WINDOW_S);
  if (!ok) {
    return send(res, 429, {
      error: `That's ${MAX_PER_DEVICE} photos from this device today — thanks for sharing!`,
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
    await releaseSliceQuota(`dev:${deviceHash}`);
    console.error('blob upload failed:', err);
    return send(res, 502, { error: 'Could not save that photo — please try again.' });
  }

  const slice = {
    id,
    url: blob.url,
    pathname: blob.pathname,
    w: meta.w,
    h: meta.h,
    // Self-declared and optional: blank means anonymous, which is also what an
    // untouched form sends — so leaving it alone is the private choice rather
    // than a setting to find. The old value was read off the order the pickup
    // code resolved to and so couldn't be faked; this one can be, and the
    // remedy is the same as for a caption: admin take-down, plus the flag
    // button any visitor can use on any tile.
    name: clean(body.name, NAME_MAX),
    caption: clean(body.caption, CAPTION_MAX),
    deviceHash,
    createdAt: Date.now(),
    // Posts go live the moment they're uploaded — moderation is take-down
    // (DELETE) only, from the community pictures page itself, not a
    // pre-publish approval queue.
    hidden: false,
  };

  try {
    await createSlice(slice);
  } catch (err) {
    await releaseSliceQuota(`dev:${deviceHash}`);
    await del(blob.url, blobAuth()).catch(() => { /* orphaned blob is better than a 500 */ });
    throw err;
  }

  return send(res, 201, { slice: publicSlice(slice), remaining: MAX_PER_DEVICE - count });
}

// PATCH /api/slices?id=… {hidden} — admin hides or restores a post
async function patch(req, res) {
  if (!isAdmin(req)) return send(res, 401, { error: 'Admin login required' });
  const { id } = readQuery(req);
  let body;
  try { body = await readBody(req); } catch (err) {
    return send(res, err instanceof BodyTooLargeError ? 413 : 400, { error: err instanceof BodyTooLargeError ? 'Invalid request.' : 'Invalid JSON' });
  }
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
    try { body = await readBody(req, { maxBytes: MAX_DELETE_BODY_BYTES }); } catch { /* no credential; fails below */ }
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
  // Deliberately no releaseSliceQuota() here: the per-device limit counts
  // photos posted, not photos currently live. Giving the slot back would turn
  // post-delete-repeat into an unlimited upload channel — and with the device
  // token now the only thing bounding a poster at all, that loop would undo
  // the whole cap rather than just one order's share of it.
  return send(res, 200, { ok: true, blobRemoved });
}
