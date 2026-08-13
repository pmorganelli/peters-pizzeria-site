import { beforeEach, describe, expect, it } from 'vitest';
import ordersHandler from './orders.js';
import loginHandler from './login.js';
import { startServer, call } from '../tests/helpers/server.js';
import { resetEnv } from '../tests/helpers/env.js';
import { openStore, adminCookie } from '../tests/helpers/fixtures.js';

let server;
let base;

beforeEach(async () => {
  resetEnv();
  await openStore();
  server = await startServer({ '/api/orders': ordersHandler, '/api/login': loginHandler });
  base = server.url;
});

describe('POST /api/orders — per-item qty cap', () => {
  it('accepts a Margherita line right at its 4-unit cap, rejects one over', async () => {
    const ok = await call(base, '/api/orders', {
      method: 'POST', body: { name: 'Test', items: [{ name: 'Margherita', qty: 4 }] },
    });
    expect(ok.status).toBe(201);
    const bad = await call(base, '/api/orders', {
      method: 'POST', body: { name: 'Test', items: [{ name: 'Margherita', qty: 5 }] },
    });
    expect(bad.status).toBe(400);
  });

  it('rejects splitting the same item across add-on combos to exceed its cap', async () => {
    // Four separate lines, each individually at the 4-unit cap but with
    // different add-ons so they don't merge into one line — 16 Margheritas
    // must still be rejected, not just 4.
    const { status } = await call(base, '/api/orders', {
      method: 'POST',
      body: {
        name: 'Test',
        items: [
          { name: 'Margherita', qty: 4 },
          { name: 'Margherita', qty: 4, addons: ['+ Extra Basil'] },
          { name: 'Margherita', qty: 4, addons: ['+ Extra Parm'] },
          { name: 'Margherita', qty: 4, addons: ['+ Extra Basil', '+ Extra Parm'] },
        ],
      },
    });
    expect(status).toBe(400);
  });

  it('applies the default 8-unit cap to an item with no explicit maxQty', async () => {
    const ok = await call(base, '/api/orders', {
      method: 'POST', body: { name: 'Test', items: [{ name: 'Pepperoni', qty: 8 }] },
    });
    expect(ok.status).toBe(201);
    const bad = await call(base, '/api/orders', {
      method: 'POST', body: { name: 'Test', items: [{ name: 'Pepperoni', qty: 9 }] },
    });
    expect(bad.status).toBe(400);
  });

  it('still rejects duplicate identical name+addon lines regardless of the aggregate cap', async () => {
    const { status } = await call(base, '/api/orders', {
      method: 'POST',
      body: { name: 'Test', items: [{ name: 'Cheese Slice', qty: 1 }, { name: 'Cheese Slice', qty: 1 }] },
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
      method: 'POST', body: { name: 'Test', items: [{ name: 'Cheese Slice', qty: 1 }] },
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
