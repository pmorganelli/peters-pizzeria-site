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

describe('DELETE /api/nights — erase an archived night', () => {
  // The reason this endpoint exists: nights closed while testing the board
  // before opening would otherwise sit in the revenue history forever.
  async function archiveNight(cookie, totalCents) {
    await insertOrder({ status: 'done', totalCents });
    const { body } = await call(base, '/api/nights', { method: 'POST', headers: { Cookie: cookie } });
    return body.night.id;
  }

  it('401s without an admin cookie', async () => {
    const cookie = await adminCookie(base);
    const id = await archiveNight(cookie, 400);
    const { status } = await call(base, `/api/nights?id=${id}`, { method: 'DELETE' });
    expect(status).toBe(401);
    // And the night is still there — a rejected delete must not half-apply.
    const { body } = await call(base, '/api/nights', { headers: { Cookie: cookie } });
    expect(body.nights).toHaveLength(1);
  });

  it('removes only the named night, leaving the rest of the archive intact', async () => {
    const cookie = await adminCookie(base);
    const first = await archiveNight(cookie, 400);
    const second = await archiveNight(cookie, 500);
    const third = await archiveNight(cookie, 600);

    const { status, body } = await call(base, `/api/nights?id=${second}`, { method: 'DELETE', headers: { Cookie: cookie } });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);

    const { body: listed } = await call(base, '/api/nights', { headers: { Cookie: cookie } });
    expect(listed.nights.map((n) => n.id)).toEqual([third, first]);
  });

  it('400s without an id rather than deleting anything', async () => {
    const cookie = await adminCookie(base);
    await archiveNight(cookie, 400);
    const { status } = await call(base, '/api/nights', { method: 'DELETE', headers: { Cookie: cookie } });
    expect(status).toBe(400);
    const { body } = await call(base, '/api/nights', { headers: { Cookie: cookie } });
    expect(body.nights).toHaveLength(1);
  });

  it('404s an unknown id', async () => {
    const cookie = await adminCookie(base);
    const { status } = await call(base, '/api/nights?id=nope', { method: 'DELETE', headers: { Cookie: cookie } });
    expect(status).toBe(404);
  });

  it('404s a second delete of the same night instead of reporting success again', async () => {
    // Two admin tabs on the archive page: both show the night, both delete it.
    // The second must be told the row is gone, so its page resyncs.
    const cookie = await adminCookie(base);
    const id = await archiveNight(cookie, 400);
    const first = await call(base, `/api/nights?id=${id}`, { method: 'DELETE', headers: { Cookie: cookie } });
    expect(first.status).toBe(200);
    const second = await call(base, `/api/nights?id=${id}`, { method: 'DELETE', headers: { Cookie: cookie } });
    expect(second.status).toBe(404);
  });

  it('does not disturb the live board', async () => {
    // Deleting history is not the same action as clearing the board — an order
    // taken after the night closed belongs to the *next* night.
    const cookie = await adminCookie(base);
    const id = await archiveNight(cookie, 400);
    await insertOrder({ status: 'new', totalCents: 700 });
    await call(base, `/api/nights?id=${id}`, { method: 'DELETE', headers: { Cookie: cookie } });
    const { body } = await call(base, '/api/orders', { headers: { Cookie: cookie } });
    expect(body.orders).toHaveLength(1);
  });

  it('lets the archive go fully empty, and close still works afterward', async () => {
    // Wiping every test night before opening is the whole point — the archive
    // has to survive being emptied and then used again for real.
    const cookie = await adminCookie(base);
    const a = await archiveNight(cookie, 400);
    const b = await archiveNight(cookie, 500);
    await call(base, `/api/nights?id=${a}`, { method: 'DELETE', headers: { Cookie: cookie } });
    await call(base, `/api/nights?id=${b}`, { method: 'DELETE', headers: { Cookie: cookie } });

    const { body: emptied } = await call(base, '/api/nights', { headers: { Cookie: cookie } });
    expect(emptied.nights).toEqual([]);

    const real = await archiveNight(cookie, 1200);
    const { body: reopened } = await call(base, '/api/nights', { headers: { Cookie: cookie } });
    expect(reopened.nights.map((n) => n.id)).toEqual([real]);
    expect(reopened.nights[0].totalCents).toBe(1200);
  });
});

describe('unsupported methods', () => {
  it('405s a PUT to /api/nights', async () => {
    const cookie = await adminCookie(base);
    const { status } = await call(base, '/api/nights', { method: 'PUT', headers: { Cookie: cookie } });
    expect(status).toBe(405);
  });
});
