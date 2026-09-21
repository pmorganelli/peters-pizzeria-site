import { beforeEach, describe, expect, it } from 'vitest';
import storeHandler from './store.js';
import ordersHandler from './orders.js';
import loginHandler from './login.js';
import { startServer, call } from '../tests/helpers/server.js';
import { resetEnv } from '../tests/helpers/env.js';
import { openStore, adminCookie, DOUGH_ITEM, DOUGH_TYPE } from '../tests/helpers/fixtures.js';
import { MAX_DOUGH_BALLS, SLICES_PER_BALL } from '../src/utils/dough.js';

// The settings endpoint, exercised through the real handler and the real
// in-memory store. The dough half is what's covered here; the enforcement that
// hangs off it lives in orders.test.js.
let server;
let base;
let cookie;

beforeEach(async () => {
  resetEnv();
  await openStore();
  server = await startServer({
    '/api/store': storeHandler, '/api/orders': ordersHandler, '/api/login': loginHandler,
  });
  base = server.url;
  cookie = await adminCookie(base);
});

const getStore = () => call(base, '/api/store');
const patchStore = (body, opts = {}) =>
  call(base, '/api/store', { method: 'PATCH', headers: { Cookie: cookie, ...opts.headers }, body });

const PER_BALL = SLICES_PER_BALL[DOUGH_TYPE];

describe('GET /api/store — dough', () => {
  it('reports nothing for a dough nobody has counted in', async () => {
    const { status, body } = await getStore();
    expect(status).toBe(200);
    // Absent, not zero: every consumer reads absent as "sell without a limit",
    // and a zero here would grey the slice out on a night nobody counted.
    expect(body.dough).toEqual({});
  });

  it('reports balls, the slices they make, and what is left', async () => {
    await patchStore({ dough: { [DOUGH_TYPE]: 2 } });
    const { body } = await getStore();
    expect(body.dough[DOUGH_TYPE]).toEqual({
      balls: 2, slices: 2 * PER_BALL, used: 0, remaining: 2 * PER_BALL,
    });
  });

  it('counts down as orders are placed, without an admin session', async () => {
    await patchStore({ dough: { [DOUGH_TYPE]: 1 } });
    await call(base, '/api/orders', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: { name: 'Test Customer', items: [{ name: DOUGH_ITEM.name, qty: 2 }] },
    });
    // No cookie on this read — the order page needs the count to grey slices
    // out, and it is public for the same reason the 86 list is.
    const { body } = await call(base, '/api/store');
    expect(body.dough[DOUGH_TYPE].used).toBe(2);
    expect(body.dough[DOUGH_TYPE].remaining).toBe(PER_BALL - 2);
  });
});

describe('PATCH /api/store — dough', () => {
  it('refuses without an admin session', async () => {
    const { status } = await call(base, '/api/store', {
      method: 'PATCH', body: { dough: { [DOUGH_TYPE]: 3 } },
    });
    expect(status).toBe(401);
    expect((await getStore()).body.dough).toEqual({});
  });

  it.each([
    ['a fraction of a ball', { [DOUGH_TYPE]: 1.5 }],
    ['a negative count', { [DOUGH_TYPE]: -1 }],
    ['a count past the typo guard', { [DOUGH_TYPE]: MAX_DOUGH_BALLS + 1 }],
    ['a dough type that does not exist', { sourdough: 3 }],
    ['a number instead of a map', 4],
    ['a list instead of a map', [3]],
  ])('rejects %s and changes nothing', async (_label, dough) => {
    await patchStore({ dough: { [DOUGH_TYPE]: 2 } });
    const { status } = await patchStore({ dough });
    expect(status).toBe(400);
    // The whole patch is refused, so the good value that was already saved
    // survives — a partial apply would leave the panel lying about the board.
    expect((await getStore()).body.dough[DOUGH_TYPE].balls).toBe(2);
  });

  it('stops counting a dough left out of the patch', async () => {
    await patchStore({ dough: { [DOUGH_TYPE]: 2 } });
    const { status, body } = await patchStore({ dough: {} });
    expect(status).toBe(200);
    expect(body.dough).toEqual({});
  });

  it('keeps zero balls, which is sold out rather than untracked', async () => {
    const { body } = await patchStore({ dough: { [DOUGH_TYPE]: 0 } });
    expect(body.dough[DOUGH_TYPE]).toEqual({ balls: 0, slices: 0, used: 0, remaining: 0 });
  });

  it('leaves the dough alone when the patch is about something else', async () => {
    await patchStore({ dough: { [DOUGH_TYPE]: 3 } });
    // Settings patches are field-level: closing the store mid-service must not
    // silently wipe the night's ball count on the way through.
    await patchStore({ mode: 'closed' });
    const { body } = await getStore();
    expect(body.open).toBe(false);
    expect(body.dough[DOUGH_TYPE].balls).toBe(3);
  });

  it('leaves the 86 list alone, and vice versa', async () => {
    await patchStore({ dough: { [DOUGH_TYPE]: 3 } });
    await patchStore({ availability: { name: DOUGH_ITEM.name, unavailable: true } });
    const { body } = await getStore();
    expect(body.unavailable).toContain(DOUGH_ITEM.name);
    expect(body.dough[DOUGH_TYPE].balls).toBe(3);
  });
});
