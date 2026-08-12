import http from 'node:http';

// Mounts one or more api/ handlers on a real ephemeral HTTP server — the same
// shape scripts/dev-api.mjs uses to run them locally. Tests hit it with plain
// fetch() rather than hand-rolled req/res mocks, so they exercise the exact
// streaming-body, header, and cookie behavior Node gives the handlers in
// production instead of a mock's approximation of it.
export function startServer(routes) {
  const server = http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://local');
    const handler = routes[pathname];
    if (!handler) {
      res.statusCode = 404;
      res.end('{"error":"not found"}');
      return;
    }
    try {
      await handler(req, res);
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

// `call` always sends a JSON content-type. Some tests (the raw Content-Length
// / oversized-body checks) need to control headers exactly, so they use
// fetch() directly against `base` instead.
export async function call(base, path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON — leave null */ }
  return { status: res.status, body: json, res };
}
