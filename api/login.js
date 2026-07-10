import { readBody, send, checkPassword, adminToken, devMode, clientIp } from './_lib/util.js';
import { rateLimit } from './_lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  // Brute-force guard: a human mistypes a few times; a bot doesn't get more.
  if (!(await rateLimit(`login:${clientIp(req)}`, 8, 300))) {
    return send(res, 429, { error: 'Too many attempts — wait a few minutes and try again.' });
  }

  let body;
  try { body = await readBody(req); } catch { return send(res, 400, { error: 'Invalid JSON' }); }

  if (!adminToken()) {
    // Redis is configured but no ADMIN_PASSWORD — refuse rather than fall back
    // to a guessable default in production.
    return send(res, 503, { error: 'Admin login is not configured. Set the ADMIN_PASSWORD environment variable in Vercel.' });
  }
  if (!checkPassword(body.password)) {
    return send(res, 401, { error: 'Wrong password' });
  }
  return send(res, 200, { token: adminToken(), devMode: devMode() });
}
