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
// Intake is admin-only now, so every POST below needs a session. Fetched once
// per test rather than per call: adminCookie() goes through the real login
// handler, which is rate-limited to 8 attempts per IP per 5 minutes, and the
// abuse-budget case alone posts 61 orders.
let cookie;

beforeEach(async () => {
  resetEnv();
  await openStore();
  server = await startServer({ '/api/orders': ordersHandler, '/api/login': loginHandler });
  base = server.url;
  cookie = await adminCookie(base);
});

// Every POST in this file wants the session header. Spelling it out at each
// call site just invites one to be forgotten, and a forgotten one fails with a
// 401 that looks nothing like the 400 or 429 the case is actually asserting.
const postOrder = (body, opts = {}) =>
  call(base, '/api/orders', {
    method: 'POST',
    ...opts,
    headers: { Cookie: cookie, ...opts.headers },
    body,
  });

// The capped item and its cap both come from menu.js. Naming a slice here is
// what broke this file when one was renamed: every request 400'd as an
// unrecognized item, which looks identical to the cap rejection these cases are
// asserting — a false pass waiting to happen.
const CAP = CAPPED_ITEM.maxQty;

describe('POST /api/orders — per-item qty cap', () => {
  it(`accepts a ${CAPPED_ITEM.name} line right at its ${CAP}-unit cap, rejects one over`, async () => {
    const ok = await postOrder({ name: 'Test', items: [{ name: CAPPED_ITEM.name, qty: CAP }] });
    expect(ok.status).toBe(201);
    const bad = await postOrder({ name: 'Test', items: [{ name: CAPPED_ITEM.name, qty: CAP + 1 }] });
    expect(bad.status).toBe(400);
  });

  it('rejects splitting the same item across add-on combos to exceed its cap', async () => {
    // Four separate lines, each individually at the cap but with different
    // add-ons so they don't merge into one line — 4x the cap must still be
    // rejected, not just one line's worth.
    const { status } = await postOrder({
      name: 'Test',
      items: [
        { name: CAPPED_ITEM.name, qty: CAP },
        { name: CAPPED_ITEM.name, qty: CAP, addons: ['+ Extra Basil'] },
        { name: CAPPED_ITEM.name, qty: CAP, addons: ['+ Extra Parm'] },
        { name: CAPPED_ITEM.name, qty: CAP, addons: ['+ Extra Basil', '+ Extra Parm'] },
      ],
    });
    expect(status).toBe(400);
  });

  it(`applies the default ${DEFAULT_MAX_QTY}-unit cap to an item with no explicit maxQty`, async () => {
    const ok = await postOrder({ name: 'Test', items: [{ name: TEST_ITEM_NAME, qty: DEFAULT_MAX_QTY }] });
    expect(ok.status).toBe(201);
    const bad = await postOrder({ name: 'Test', items: [{ name: TEST_ITEM_NAME, qty: DEFAULT_MAX_QTY + 1 }] });
    expect(bad.status).toBe(400);
  });

  it('still rejects duplicate identical name+addon lines regardless of the aggregate cap', async () => {
    const { status } = await postOrder({
      name: 'Test', items: [{ name: TEST_ITEM_NAME, qty: 1 }, { name: TEST_ITEM_NAME, qty: 1 }],
    });
    expect(status).toBe(400);
  });
});

describe('POST /api/orders — admin gate', () => {
  const walkIn = { name: 'Walk-in', items: [{ name: TEST_ITEM_NAME, qty: 1 }] };

  it('401s an order placed with no session at all', async () => {
    const { status, body } = await call(base, '/api/orders', { method: 'POST', body: walkIn });
    expect(status).toBe(401);
    expect(body.error).toMatch(/admin/i);
  });

  it('401s a forged session cookie', async () => {
    const { status } = await call(base, '/api/orders', {
      method: 'POST',
      headers: { Cookie: `${cookie.split('=')[0]}=${Date.now()}.deadbeef` },
      body: walkIn,
    });
    expect(status).toBe(401);
  });

  it('turns an unauthenticated order away before it can spend the rate-limit budget', async () => {
    // The gate has to be the *first* thing create() does. Below the limiter,
    // anyone could empty the per-IP window and lock the window staff out of
    // their own order form — from the same campus NAT address, no less.
    // 61 attempts is one past ORDERS_PER_IP, so if even one of them reached
    // the limiter the authenticated order afterwards would come back 429.
    for (let i = 0; i < 61; i += 1) {
      const { status } = await call(base, '/api/orders', { method: 'POST', body: walkIn });
      expect(status).toBe(401);
    }
    const ok = await postOrder({ name: 'Test', items: [{ name: TEST_ITEM_NAME, qty: 1 }] });
    expect(ok.status).toBe(201);
  });

  it('still lets a customer read the order staff typed for them', async () => {
    // The point of the whole change: only *writing* moved behind the login.
    // Both reads below are unauthenticated, as they would be on the customer's
    // own phone with nothing but the pickup code they were handed.
    const created = await postOrder({ name: 'Casey', items: [{ name: TEST_ITEM_NAME, qty: 1 }] });
    const { id, code } = created.body.order;
    expect((await call(base, `/api/orders?id=${id}`)).status).toBe(200);
    expect((await call(base, `/api/orders?find=${code}`)).status).toBe(200);
  });
});

describe('PATCH /api/orders?id= — status transitions', () => {
  it('401s without an admin cookie', async () => {
    const { status } = await call(base, '/api/orders?id=whatever', { method: 'PATCH', body: { status: 'firing' } });
    expect(status).toBe(401);
  });

  it('rejects a status transition out of a terminal state', async () => {
    const created = await postOrder({ name: 'Test', items: [{ name: TEST_ITEM_NAME, qty: 1 }] });
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
    const created = await postOrder({
      name: 'Casey', contact: '555-0199', items: [{ name: TEST_ITEM_NAME, qty: 1 }],
    });
    expect(created.status).toBe(201);

    // Read it back through the admin board, which is the one surface that does
    // see contact/notes — so an empty value here means it was never stored.
    const board = await call(base, '/api/orders', { headers: { Cookie: cookie } });
    const mine = board.body.orders.find((o) => o.id === created.body.order.id);
    expect(mine.contact).toBeUndefined();
  });
});

describe('public pickup-code lookup', () => {
  it('requires the whole pickup code — a partial is not a lookup', async () => {
    // `?find=` also matches on an exact name (see the name-lookup block
    // below), so neither of the misses here is a name either: 'casey' is not
    // 'casey customer', and 'ab2' is nobody.
    const order = await insertOrder({ name: 'Casey Customer', code: 'AB2C' });
    expect((await call(base, '/api/orders?find=Casey')).status).toBe(404);
    expect((await call(base, '/api/orders?find=AB2')).status).toBe(404);
    const exact = await call(base, '/api/orders?find=%23ab2c');
    expect(exact.status).toBe(200);
    expect(exact.body.order.id).toBe(order.id);
  });
});

// Name lookup was deliberately removed once and is deliberately back — see the
// block comment above findOrdersByName() in orders.js for what changed around
// it. These pin the parts that keep it a lookup rather than a harvesting tool.
describe('GET /api/orders?find= — name lookup', () => {
  const items = [{ name: TEST_ITEM_NAME, qty: 1 }];

  it('finds an order by its exact name in any capitalization or spacing', async () => {
    const created = await postOrder({ name: 'Casey Customer', items });
    for (const q of ['Casey Customer', 'casey customer', 'CASEY CUSTOMER', '  Casey   Customer ']) {
      const { status, body } = await call(base, `/api/orders?find=${encodeURIComponent(q)}`);
      expect(status).toBe(200);
      expect(body.order.id).toBe(created.body.order.id);
    }
  });

  it('never matches a prefix, a partial, or one half of a name', async () => {
    // A prefix match is what turned the old version into a way to enumerate
    // customers: "sar" finding Sarah means you don't need to know anyone.
    await postOrder({ name: 'Casey Customer', items });
    expect((await call(base, '/api/orders?find=Casey')).status).toBe(404);
    expect((await call(base, '/api/orders?find=Customer')).status).toBe(404);
    expect((await call(base, '/api/orders?find=Casey%20C')).status).toBe(404);
  });

  it('hands back a pickable list when one name has several live orders', async () => {
    const one = await postOrder({ name: 'Sam', items });
    const two = await postOrder({ name: 'Sam', items: [{ name: TEST_ITEM_NAME, qty: 2 }] });
    const { status, body } = await call(base, '/api/orders?find=sam');
    expect(status).toBe(200);
    expect(body.order).toBeUndefined();
    expect(body.matches.map((m) => m.id).sort())
      .toEqual([one.body.order.id, two.body.order.id].sort());
    // Enough to recognise your own, and nothing more.
    for (const m of body.matches) {
      expect(m.items).toBeTruthy();
      expect(m.createdAt).toBeTruthy();
      expect(m.code).toBeUndefined();
      expect(m.name).toBeUndefined();
      expect(m.notes).toBeUndefined();
      expect(m.contact).toBeUndefined();
    }
  });

  it('caps how many orders one name search can print', async () => {
    for (let i = 0; i < 10; i += 1) await insertOrder({ name: 'Common Name' });
    const { body } = await call(base, '/api/orders?find=common%20name');
    expect(body.matches).toHaveLength(8);
  });

  it('lets a pickup code win over someone whose name is shaped like one', async () => {
    // The credential path has to be tried first, or a namesake could shadow it.
    const real = await insertOrder({ name: 'Zed', code: 'AB2C' });
    await insertOrder({ name: 'AB2C' });
    const { body } = await call(base, '/api/orders?find=ab2c');
    expect(body.order.id).toBe(real.id);
  });

  it('scrubs contact and notes out of a name lookup too', async () => {
    await insertOrder({ name: 'Legacy Person', contact: '555-0100', notes: 'ring twice' });
    const { body } = await call(base, '/api/orders?find=legacy%20person');
    expect(body.order.contact).toBeUndefined();
    expect(body.order.notes).toBeUndefined();
  });

  it('spends the same per-IP budget as a code lookup (30/10min)', async () => {
    // The limiter is the main thing bounding how much of the board a name
    // search can sweep, so it has to cover this path too — not just `?find=`
    // when the query happens to look like a code.
    await postOrder({ name: 'Casey Customer', items });
    let last;
    for (let i = 0; i < 31; i += 1) {
      last = await call(base, '/api/orders?find=casey%20customer');
    }
    expect(last.status).toBe(429);
  });
});

describe('POST /api/orders — idempotent retries', () => {
  const key = 'retry_key_1234567890';
  const body = { name: 'Retry Customer', items: [{ name: TEST_ITEM_NAME, qty: 1 }] };

  it('returns the original order when the same attempt is retried', async () => {
    const first = await postOrder(body, { headers: { 'Idempotency-Key': key } });
    const retry = await postOrder(body, { headers: { 'Idempotency-Key': key } });
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({ replayed: true, order: { id: first.body.order.id } });

    const board = await call(base, '/api/orders', { headers: { Cookie: cookie } });
    expect(board.body.orders).toHaveLength(1);
  });

  it('rejects reusing one key for different order contents', async () => {
    await postOrder(body, { headers: { 'Idempotency-Key': key } });
    const conflict = await postOrder({ ...body, notes: 'different' }, { headers: { 'Idempotency-Key': key } });
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
      const { status } = await postOrder(body);
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
    const { status } = await postOrder({ name: 'Test', items: [{ name: TEST_ITEM_NAME, qty: 1 }] });
    expect(status).toBe(201);
  });
});
