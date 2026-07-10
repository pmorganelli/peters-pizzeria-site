// Local stand-in for Vercel's serverless runtime: mounts the same api/
// handlers on a plain Node server. Run alongside `npm run dev` (the Vite
// config proxies /api here). Orders are held in memory — restarting clears them.
import http from 'node:http';
import ordersHandler from '../api/orders.js';
import loginHandler from '../api/login.js';
import storeHandler from '../api/store.js';

const PORT = process.env.API_PORT || 3010;
const routes = {
  '/api/orders': ordersHandler,
  '/api/login': loginHandler,
  '/api/store': storeHandler,
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
  console.log(`[dev-api] listening on http://localhost:${PORT} (in-memory orders${process.env.ADMIN_PASSWORD ? '' : ', admin password: "admin"'})`);
});
