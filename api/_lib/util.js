import crypto from 'node:crypto';

// ── Request helpers (work both on Vercel and in scripts/dev-api.mjs) ──

export async function readBody(req) {
  let body;
  if (req.body !== undefined) {
    // Vercel parses JSON bodies; it may hand us a string for other content types
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  } else {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    body = raw ? JSON.parse(raw) : {};
  }
  // JSON.parse legally returns null/numbers/strings too; handlers expect an
  // object, and `null` would turn their field reads into a 500 instead of a 400.
  return body && typeof body === 'object' ? body : {};
}

export function readQuery(req) {
  return Object.fromEntries(new URL(req.url, 'http://local').searchParams);
}

// Vercel puts the real client IP first in x-forwarded-for
export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (typeof fwd === 'string' && fwd.split(',')[0].trim()) || req.socket?.remoteAddress || 'unknown';
}

export function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

// ── Admin auth ─────────────────────────────────────────────────────────
// The admin password lives in the ADMIN_PASSWORD env var. A successful login
// exchanges it for a stateless HMAC token derived from that password, so
// changing the password invalidates outstanding sessions.

export function devMode() {
  // No password configured AND no Redis configured → local development.
  // Never on Vercel: missing Redis there is a misconfigured deploy, not dev,
  // and must not unlock the fallback 'admin' password.
  return !process.env.VERCEL && !process.env.ADMIN_PASSWORD && !hasRedisEnv();
}

export function hasRedisEnv() {
  return Boolean(
    (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) ||
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
  );
}

function adminSecret() {
  return process.env.ADMIN_PASSWORD || (devMode() ? 'admin' : null);
}

// Bumping this label invalidates every outstanding session at once — the one
// global logout available without storing session state server-side.
const TOKEN_VERSION = 'pp-admin-v2';

// How long a session stays valid, enforced *server-side*. The cookie's Max-Age
// is only a hint to the browser; this is the check that actually matters.
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// A little tolerance for clock skew between the machine that minted a token and
// the one verifying it — a token stamped slightly in the future is a clock
// difference, not an attack (the signature covers the timestamp, so a forged
// one can't verify anyway).
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export function adminConfigured() {
  return adminSecret() !== null;
}

function signToken(issuedAt) {
  const secret = adminSecret();
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update(`${TOKEN_VERSION}|${issuedAt}`).digest('hex');
}

// `<issuedAt>.<hmac>`. The timestamp is inside the signed message, so it can't
// be edited without invalidating the signature — which is what lets the server
// expire a session it never stored.
export function mintAdminToken(now = Date.now()) {
  const signature = signToken(now);
  return signature && `${now}.${signature}`;
}

// Returns the issuedAt of a valid token, or null. Split out from isAdmin() so
// the expiry rules can be tested without building a request.
export function verifyAdminToken(token, now = Date.now()) {
  if (typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot === -1) return null;
  const issuedAt = Number(token.slice(0, dot));
  if (!Number.isSafeInteger(issuedAt)) return null;

  // Verify the signature before trusting the timestamp for anything.
  const expected = signToken(issuedAt);
  if (!expected) return null;
  const provided = Buffer.from(token.slice(dot + 1));
  const expectedBuf = Buffer.from(expected);
  // Compare byte lengths, not string lengths — a multibyte value with the right
  // character count would make timingSafeEqual throw.
  if (provided.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(provided, expectedBuf)) return null;

  if (issuedAt > now + CLOCK_SKEW_MS) return null;
  if (now - issuedAt > SESSION_MAX_AGE_MS) return null;
  return issuedAt;
}

export function checkPassword(password) {
  const secret = adminSecret();
  if (!secret || typeof password !== 'string') return false;
  const a = crypto.createHash('sha256').update(password).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}

// The token lives in an HttpOnly cookie — client-side JS (and any XSS on the
// page) can never read it, only the browser automatically resending it to us.
const COOKIE_NAME = 'pp_admin';
// Derived from the server-side rule so the browser drops the cookie at the same
// moment the server stops honouring it, instead of the two dates drifting apart.
const COOKIE_MAX_AGE = Math.floor(SESSION_MAX_AGE_MS / 1000);

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    // A malformed %-escape in any cookie must not throw — skip that cookie
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore */ }
  }
  return out;
}

// `Secure` only on Vercel: local dev serves http://localhost, and Safari
// (unlike Chrome/Firefox) refuses Secure cookies over plain http even there.
const cookieAttrs = () => `HttpOnly;${process.env.VERCEL ? ' Secure;' : ''} SameSite=Strict; Path=/`;

export function setAuthCookie(res, value) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(value)}; ${cookieAttrs()}; Max-Age=${COOKIE_MAX_AGE}`);
}

export function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; ${cookieAttrs()}; Max-Age=0`);
}

export function isAdmin(req) {
  return verifyAdminToken(parseCookies(req)[COOKIE_NAME] || '') !== null;
}
