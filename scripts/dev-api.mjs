// Local stand-in for Vercel's serverless runtime: mounts the same api/
// handlers on a plain Node server. Run alongside `npm run dev` (the Vite
// config proxies /api here). Orders are held in memory — restarting clears them.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import ordersHandler from '../api/orders.js';
import loginHandler from '../api/login.js';
import storeHandler from '../api/store.js';
import slicesHandler from '../api/slices.js';
import nightsHandler from '../api/nights.js';
import reportsHandler from '../api/reports.js';
import { devMode } from '../api/_lib/util.js';

// Pull *only* the Blob credentials out of .env.local, so photo posting can be
// tested locally against the real store. Loading the whole file would be
// actively harmful: KV_REST_API_* would point local dev at the production
// Redis (real orders, written by test runs), and would flip devMode() off,
// taking the "admin" dev password with it and locking you out of the board.
const BLOB_KEYS = ['BLOB_READ_WRITE_TOKEN', 'BLOB_STORE_ID', 'VERCEL_OIDC_TOKEN'];
try {
  const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  for (const line of raw.split('\n')) {
    const eq = line.indexOf('=');
    if (eq === -1 || line.trimStart().startsWith('#')) continue;
    const key = line.slice(0, eq).trim();
    if (!BLOB_KEYS.includes(key) || process.env[key]) continue;
    process.env[key] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
} catch { /* no .env.local — posting just stays disabled locally */ }

const PORT = process.env.API_PORT || 3010;
const routes = {
  '/api/orders': ordersHandler,
  '/api/login': loginHandler,
  '/api/store': storeHandler,
  '/api/slices': slicesHandler,
  '/api/nights': nightsHandler,
  '/api/reports': reportsHandler,
};

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://local');
  const handler = routes[pathname];
  if (!handler) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }
  try {
    await handler(req, res);
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Internal error' }));
  }
}).listen(PORT, () => {
  console.log(`[dev-api] listening on http://localhost:${PORT} (in-memory orders${devMode() ? ', admin password: "admin"' : ''})`);
});
