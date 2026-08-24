import { call } from './server.js';
import { saveSettings, createOrder } from '../../api/_lib/store.js';
import { DEFAULT_SETTINGS } from '../../api/_lib/hours.js';
import { MENU_DATA } from '../../src/data/menu.js';
import { parsePriceCents } from '../../src/utils/orders.js';

// ── Menu-derived fixtures ─────────────────────────────────────────────
// Read off the real menu rather than hardcoded. Prices are recomputed
// server-side from src/data/menu.js, so a test that names an item the menu no
// longer sells gets a 400 ("we did not recognize") from validateItems() — and
// renaming one slice used to fail ~50 tests across four files that had no
// business caring what the slice was called. Nothing below depends on a
// specific item existing, only on the shapes the menu guarantees: some
// orderable slice, and one with its own maxQty.
const SLICE_SECTION = MENU_DATA.find((s) => s.items.some((i) => i.maxQty !== undefined))
  ?? MENU_DATA[0];

const SLICE_CATEGORY = SLICE_SECTION.category;
// An ordinary slice with no per-item cap — the default subject of a test order.
const TEST_ITEM = SLICE_SECTION.items.find((i) => i.maxQty === undefined) ?? SLICE_SECTION.items[0];
export const TEST_ITEM_NAME = TEST_ITEM.name;
const TEST_ITEM_CENTS = parsePriceCents(TEST_ITEM.price);
// The one carrying a lower maxQty, for the per-item cap tests.
export const CAPPED_ITEM = SLICE_SECTION.items.find((i) => i.maxQty !== undefined);

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
    body: { name: 'Test Customer', items: [{ name: TEST_ITEM_NAME, qty: 1 }], ...overrides },
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
    items: [{ name: TEST_ITEM_NAME, category: SLICE_CATEGORY, priceCents: TEST_ITEM_CENTS, qty: 1 }],
    totalCents: TEST_ITEM_CENTS,
    status: 'new',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  await createOrder(order);
  return order;
}
