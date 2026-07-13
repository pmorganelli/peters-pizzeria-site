// Tiny fetch wrapper: JSON in/out, throws Error with .status on non-2xx.
// credentials: 'same-origin' so the HttpOnly admin cookie rides along on admin calls.
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
  }
  return data;
}
