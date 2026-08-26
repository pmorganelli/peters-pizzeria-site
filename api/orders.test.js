import { beforeEach, describe, expect, it } from 'vitest';
import ordersHandler from './orders.js';
import loginHandler from './login.js';
import { startServer, call } from '../tests/helpers/server.js';
import { resetEnv } from '../tests/helpers/env.js';
import { openStore, adminCookie, insertOrder, TEST_ITEM_NAME, CAPPED_ITEM } from '../tests/helpers/fixtures.js';
import { saveSettings } from './_lib/store.js';
import { DEFAULT_SETTINGS } from './_lib/hours.js';
import { DEFAULT_MAX_QTY } from '../src/utils/orders.js';

let server;
let base;

beforeEach(async () => {
  resetEnv();
  await openStore();
  server = await startServer({ '/api/orders': ordersHandler, '/api/login': loginHandler });
  base = server.url;
});

// The capped item and its cap both come from menu.js. Naming a slice here is
// what broke this file when one was renamed: every request 400'd as an
// unrecognized item, which looks identical to the cap rejection these cases are
// asserting — a false pass waiting to happen.
const CAP = CAPPED_ITEM.maxQty;

describe('POST /api/orders — per-item qty cap', () => {
  it(`accepts a ${CAPPED_ITEM.name} line right at its ${CAP}-unit cap, rejects one over`, async () => {
    const ok = await call(base, '/api/orders', {
      method: 'POST', body: { name: 'Test', items: [{ name: CAPPED_ITEM.name, qty: CAP }] },
    });
    expect(ok.status).toBe(201);
    const bad = await call(base, '/api/orders', {
      method: 'POST', body: { name: 'Test', items: [{ name: CAPPED_ITEM.name, qty: CAP + 1 }] },
    });
    expect(bad.status).toBe(400);
  });

  it('rejects splitting the same item across add-on combos to exceed its cap', async () => {
    // Four separate lines, each individually at the cap but with different
    // add-ons so they don't merge into one line — 4x the cap must still be
    // rejected, not just one line's worth.
    const { status } = await call(base, '/api/orders', {
      method: 'POST',
      body: {
        name: 'Test',
        items: [
          { name: CAPPED_ITEM.name, qty: CAP },
          { name: CAPPED_ITEM.name, qty: CAP, addons: ['+ Extra Basil'] },
          { name: CAPPED_ITEM.name, qty: CAP, addons: ['+ Extra Parm'] },
          { name: CAPPED_ITEM.name, qty: CAP, addons: ['+ Extra Basil', '+ Extra Parm'] },
        ],
      },
    });
    expect(status).toBe(400);
  });

  it(`applies the default ${DEFAULT_MAX_QTY}-unit cap to an item with no explicit maxQty`, async () => {
    const ok = await call(base, '/api/orders', {
      method: 'POST', body: { name: 'Test', items: [{ name: TEST_ITEM_NAME, qty: DEFAULT_MAX_QTY }] },
    });
    expect(ok.status).toBe(201);
    const bad = await call(base, '/api/orders', {
      method: 'POST', body: { name: 'Test', items: [{ name: TEST_ITEM_NAME, qty: DEFAULT_MAX_QTY + 1 }] },
    });
    expect(bad.status).toBe(400);
  });

  it('still rejects duplicate identical name+addon lines regardless of the aggregate cap', async () => {
    const { status } = await call(base, '/api/orders', {
      method: 'POST',
      body: { name: 'Test', items: [{ name: TEST_ITEM_NAME, qty: 1 }, { name: TEST_ITEM_NAME, qty: 1 }] },
    });
    expect(status).toBe(400);
  });
});

describe('PATCH /api/orders?id= — status transitions', () => {
  it('401s without an admin cookie', async () => {
    const { status } = await call(base, '/api/orders?id=whatever', { method: 'PATCH', body: { status: 'firing' } });
    expect(status).toBe(401);
  });

  it('rejects a status transition out of a terminal state', async () => {
    const created = await call(base, '/api/orders', {
      method: 'POST', body: { name: 'Test', items: [{ name: TEST_ITEM_NAME, qty: 1 }] },
    });
    const cookie = await adminCookie(base);
    await call(base, `/api/orders?id=${created.body.order.id}`, {
      method: 'PATCH', headers: { Cookie: cookie }, body: { status: 'cancelled' },
    });
    const { status, body } = await call(base, `/api/orders?id=${created.body.order.id}`, {
      method: 'PATCH', headers: { Cookie: cookie }, body: { status: 'firing' },
    });
    expect(status).toBe(409);
    expect(body.error).toMatch(/already cancelled/i);
  });
});

describe('PII in public order reads', () => {
  it('never returns contact or notes on a public lookup', async () => {
    // `contact` is no longer collected, but an order written before it was
    // dropped can still be live in the store for its 3-day TTL — and the
    // scrubbing in publicOrder() is the only thing keeping it server-side.
    const legacy = await insertOrder({ contact: '555-0100', notes: 'ring the doorbell' });

    const byId = await call(base, `/api/orders?id=${legacy.id}`);
    expect(byId.status).toBe(200);
    expect(byId.body.order.contact).toBeUndefined();
    expect(byId.body.order.notes).toBeUndefined();

    const byCode = await call(base, `/api/orders?find=${legacy.code}`);
    expect(byCode.status).toBe(200);
    expect(byCode.body.order.contact).toBeUndefined();
    expect(byCode.body.order.notes).toBeUndefined();
  });

  it('does not store a contact field even when one is posted', async () => {
    const created = await call(base, '/api/orders', {
      method: 'POST',
      body: { name: 'Casey', contact: '555-0199', items: [{ name: TEST_ITEM_NAME, qty: 1 }] },
    });
    expect(created.status).toBe(201);

    // Read it back through the admin board, which is the one surface that does
    // see contact/notes — so an empty value here means it was never stored.
    const cookie = await adminCookie(base);
    const board = await call(base, '/api/orders', { headers: { Cookie: cookie } });
    const mine = board.body.orders.find((o) => o.id === created.body.order.id);
    expect(mine.contact).toBeUndefined();
  });
});

describe('public pickup-code lookup', () => {
  it('requires the exact pickup code and never falls back to a name or prefix', async () => {
    const order = await insertOrder({ name: 'Casey Customer', code: 'AB2C' });
    expect((await call(base, '/api/orders?find=Casey')).status).toBe(404);
    expect((await call(base, '/api/orders?find=AB2')).status).toBe(404);
    const exact = await call(base, '/api/orders?find=%23ab2c');
    expect(exact.status).toBe(200);
    expect(exact.body.order.id).toBe(order.id);
  });
});

describe('POST /api/orders — idempotent retries', () => {
  const key = 'retry_key_1234567890';
  const body = { name: 'Retry Customer', items: [{ name: TEST_ITEM_NAME, qty: 1 }] };

  it('returns the original order when the same attempt is retried', async () => {
    const first = await call(base, '/api/orders', {
      method: 'POST', headers: { 'Idempotency-Key': key }, body,
    });
    const retry = await call(base, '/api/orders', {
      method: 'POST', headers: { 'Idempotency-Key': key }, body,
    });
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({ replayed: true, order: { id: first.body.order.id } });

    const cookie = await adminCookie(base);
    const board = await call(base, '/api/orders', { headers: { Cookie: cookie } });
    expect(board.body.orders).toHaveLength(1);
  });

  it('rejects reusing one key for different order contents', async () => {
    await call(base, '/api/orders', { method: 'POST', headers: { 'Idempotency-Key': key }, body });
    const conflict = await call(base, '/api/orders', {
      method: 'POST', headers: { 'Idempotency-Key': key }, body: { ...body, notes: 'different' },
    });
    expect(conflict.status).toBe(409);
  });
});

describe('POST /api/orders — abuse budget vs. the closed-store gate', () => {
  it('consumes the per-IP limit even while the store is closed', async () => {
    // The rate limits have to sit above the closed-store check, not below it.
    // The store is closed most of the week, so limiting only the requests that
    // get *past* the gate leaves intake effectively unlimited almost all the
    // time — and every rejected attempt still costs a body read and a settings
    // lookup. 60 is ORDERS_PER_IP; the 61st must be turned away by the limiter
    // rather than answered with another cheap-looking 403 forever.
    await saveSettings({ ...DEFAULT_SETTINGS, mode: 'closed' });
    const body = { name: 'Test', items: [{ name: TEST_ITEM_NAME, qty: 1 }] };

    let closed = 0;
    let limited = 0;
    for (let i = 0; i < 61; i += 1) {
      const { status } = await call(base, '/api/orders', { method: 'POST', body });
      if (status === 403) closed += 1;
      if (status === 429) limited += 1;
    }

    expect(closed).toBe(60);
    expect(limited).toBe(1);
  });
});

describe('POST /api/orders — empty 86 list stored as an object', () => {
  it('still accepts an order when unavailable is not an array', async () => {
    // The shape PATCH_SETTINGS_LUA writes for an empty 86 list (Redis cjson
    // cannot encode an empty array). Reaching `new Set(settings.unavailable)`
    // with an object throws, which 500s every order rather than rejecting one.
    await saveSettings({ ...DEFAULT_SETTINGS, mode: 'open', unavailable: {} });
    const { status } = await call(base, '/api/orders', {
      method: 'POST', body: { name: 'Test', items: [{ name: TEST_ITEM_NAME, qty: 1 }] },
    });
    expect(status).toBe(201);
  });
});
