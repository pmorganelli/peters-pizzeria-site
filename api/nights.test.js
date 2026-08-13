import { beforeEach, describe, expect, it } from 'vitest';
import nightsHandler from './nights.js';
import ordersHandler from './orders.js';
import loginHandler from './login.js';
import { startServer, call } from '../tests/helpers/server.js';
import { resetEnv } from '../tests/helpers/env.js';
import { openStore, adminCookie, insertOrder } from '../tests/helpers/fixtures.js';

let server;
let base;

beforeEach(async () => {
  resetEnv();
  await openStore();
  server = await startServer({ '/api/nights': nightsHandler, '/api/orders': ordersHandler, '/api/login': loginHandler });
  base = server.url;
});

describe('GET /api/nights', () => {
  it('401s without an admin cookie', async () => {
    const { status } = await call(base, '/api/nights');
    expect(status).toBe(401);
  });

  it('401s with a forged cookie value', async () => {
    const { status } = await call(base, '/api/nights', { headers: { Cookie: 'pp_admin=not-the-real-token' } });
    expect(status).toBe(401);
  });

  it('lists past nights newest first', async () => {
    const cookie = await adminCookie(base);
    await insertOrder({ status: 'done', totalCents: 400 });
    const first = await call(base, '/api/nights', { method: 'POST', headers: { Cookie: cookie } });
    await insertOrder({ status: 'done', totalCents: 500 });
    const second = await call(base, '/api/nights', { method: 'POST', headers: { Cookie: cookie } });
    const { body } = await call(base, '/api/nights', { headers: { Cookie: cookie } });
    expect(body.nights.map((n) => n.id)).toEqual([second.body.night.id, first.body.night.id]);
  });
});

describe('POST /api/nights — close for the night', () => {
  it('401s without an admin cookie', async () => {
    const { status } = await call(base, '/api/nights', { method: 'POST' });
    expect(status).toBe(401);
  });

  it('totals only picked-up orders, but counts everything', async () => {
    await insertOrder({ status: 'done', totalCents: 400 });
    await insertOrder({ status: 'done', totalCents: 250 });
    await insertOrder({ status: 'cancelled', totalCents: 999 });
    await insertOrder({ status: 'new', totalCents: 999 });
    const cookie = await adminCookie(base);
    const { status, body } = await call(base, '/api/nights', { method: 'POST', headers: { Cookie: cookie } });
    expect(status).toBe(201);
    expect(body.night).toMatchObject({
      orderCount: 4,
      doneCount: 2,
      cancelledCount: 1,
      totalCents: 650,
    });
  });

  it('archives a per-order snapshot with who/what/how-much, but not contact or notes', async () => {
    await insertOrder({
      name: 'Jamie Somebody', status: 'done', totalCents: 400, contact: '555-1234', notes: 'extra napkins',
      items: [{ name: 'Cheese Slice', category: 'Saturday Slices', priceCents: 200, qty: 2 }],
    });
    const cookie = await adminCookie(base);
    const { body } = await call(base, '/api/nights', { method: 'POST', headers: { Cookie: cookie } });
    expect(body.night.orders).toHaveLength(1);
    const archived = body.night.orders[0];
    expect(archived).toMatchObject({ name: 'Jamie Somebody', totalCents: 400, status: 'done' });
    expect(archived.items).toEqual([{ name: 'Cheese Slice', category: 'Saturday Slices', priceCents: 200, qty: 2 }]);
    expect(archived.contact).toBeUndefined();
    expect(archived.notes).toBeUndefined();
  });

  it('clears the live board after archiving', async () => {
    await insertOrder({ status: 'done', totalCents: 400 });
    const cookie = await adminCookie(base);
    await call(base, '/api/nights', { method: 'POST', headers: { Cookie: cookie } });
    const { body } = await call(base, '/api/orders', { headers: { Cookie: cookie } });
    expect(body.orders).toEqual([]);
  });

  it('refuses to close an empty board instead of archiving a zero-count night', async () => {
    // The double-close race: a second admin tab whose stale poll still shows
    // orders fires its POST after the first tab already archived and cleared.
    // The server must 409, not write a spurious empty record to the
    // permanent archive.
    const cookie = await adminCookie(base);
    const { status, body } = await call(base, '/api/nights', { method: 'POST', headers: { Cookie: cookie } });
    expect(status).toBe(409);
    expect(body.error).toMatch(/already empty/i);
    const { body: listed } = await call(base, '/api/nights', { headers: { Cookie: cookie } });
    expect(listed.nights).toEqual([]);
  });

  it('a second close after a successful one 409s rather than double-archiving', async () => {
    await insertOrder({ status: 'done', totalCents: 400 });
    const cookie = await adminCookie(base);
    const first = await call(base, '/api/nights', { method: 'POST', headers: { Cookie: cookie } });
    expect(first.status).toBe(201);
    const second = await call(base, '/api/nights', { method: 'POST', headers: { Cookie: cookie } });
    expect(second.status).toBe(409);
    const { body: listed } = await call(base, '/api/nights', { headers: { Cookie: cookie } });
    expect(listed.nights).toHaveLength(1);
  });
});

describe('unsupported methods', () => {
  it('405s a PUT to /api/nights', async () => {
    const cookie = await adminCookie(base);
    const { status } = await call(base, '/api/nights', { method: 'PUT', headers: { Cookie: cookie } });
    expect(status).toBe(405);
  });
});
