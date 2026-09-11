// Tiny fetch wrapper: JSON in/out, throws Error with .status on non-2xx.
// credentials: 'same-origin' so the HttpOnly admin cookie rides along on admin calls.
export async function api(path, { method = 'GET', body, headers = {}, signal } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json', ...headers } : headers,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  // Status first, body second. Both branches still parse — a non-2xx body
  // carries the server's `error` string, which is what the order page and the
  // admin board surface to the user — but checking `res.ok` before consuming
  // makes the failure path explicit rather than something that falls out of a
  // truthiness check further down.
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.error || `Request failed (${res.status})`), { status: res.status });
  }
  return res.json().catch(() => ({}));
}
