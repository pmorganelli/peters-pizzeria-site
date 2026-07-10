import crypto from 'node:crypto';

// ── Request helpers (work both on Vercel and in scripts/dev-api.mjs) ──

export async function readBody(req) {
  if (req.body !== undefined) {
    // Vercel parses JSON bodies; it may hand us a string for other content types
    return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export function readQuery(req) {
  return Object.fromEntries(new URL(req.url, 'http://local').searchParams);
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
  return !process.env.ADMIN_PASSWORD && !hasRedisEnv();
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

export function isAdmin(req) {
  const token = adminToken();
  if (!token) return false;
  const header = req.headers.authorization || '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (provided.length !== token.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(token));
}
