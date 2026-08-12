import { call } from './server.js';
import { saveSettings, createOrder } from '../../api/_lib/store.js';
import { DEFAULT_SETTINGS } from '../../api/_lib/hours.js';

// Order creation 403s unless the store is "open" — DEFAULT_SETTINGS.mode is
// 'auto' and follows a real weekly window, which would make tests flaky
// depending on when they happen to run. Force it open instead of mocking
// time.
export async function openStore(overrides = {}) {
  await saveSettings({ ...DEFAULT_SETTINGS, mode: 'open', ...overrides });
}

// Places a real order through the real handler + store (in-memory fallback),
// so slice tests exercise genuine order records rather than hand-built stubs
// that could drift from what validateItems()/createOrder() actually produce.
export async function placeOrder(base, overrides = {}) {
  const { status, body } = await call(base, '/api/orders', {
    method: 'POST',
    body: { name: 'Test Customer', items: [{ name: 'Cheese Slice', qty: 1 }], ...overrides },
  });
  if (status !== 201) throw new Error(`fixture order failed: ${status} ${JSON.stringify(body)}`);
  return body.order;
}

// Logs in as admin (devMode()'s "admin" password, since tests run with no
// ADMIN_PASSWORD/Redis configured) and returns the Set-Cookie value ready to
// pass as a Cookie header on subsequent requests.
export async function adminCookie(base, password = 'admin') {
  const res = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) throw new Error(`login did not set a cookie (status ${res.status})`);
  return setCookie.split(';')[0]; // "pp_admin=<value>"
}

let orderCounter = 0;

// Writes an order straight into the store, bypassing the HTTP handler. Used
// for edge cases (an expired or cancelled order) that placeOrder() can't
// produce deterministically without faking the system clock.
export async function insertOrder(overrides = {}) {
  orderCounter += 1;
  const now = Date.now();
  const order = {
    id: `test-order-${orderCounter}`,
    code: `TEST${orderCounter}`,
    name: 'Test Customer',
    contact: '',
    notes: '',
    items: [{ name: 'Cheese Slice', category: 'Saturday Slices', priceCents: 200, qty: 1 }],
    totalCents: 200,
    status: 'new',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  await createOrder(order);
  return order;
}
