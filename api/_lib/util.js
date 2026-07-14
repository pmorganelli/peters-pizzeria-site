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

export function adminToken() {
  const secret = adminSecret();
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update('pp-admin-v1').digest('hex');
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
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setAuthCookie(res, value) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${COOKIE_MAX_AGE}`);
}

export function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
}

export function isAdmin(req) {
  const token = adminToken();
  if (!token) return false;
  const provided = parseCookies(req)[COOKIE_NAME] || '';
  if (provided.length !== token.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(token));
}
