import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import storeHandler from './store.js';
import ordersHandler from './orders.js';
import loginHandler from './login.js';
import { startServer, call } from '../tests/helpers/server.js';
import { resetEnv } from '../tests/helpers/env.js';
import { ORDER_TTL_SECONDS } from './_lib/store.js';
import { openStore, adminCookie, DOUGH_ITEM, DOUGH_TYPE } from '../tests/helpers/fixtures.js';
import { MAX_DOUGH_BALLS, SLICES_PER_BALL, DOUGH_TYPES } from '../src/utils/dough.js';

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
// The admin board polls the same endpoint with its session cookie, which is
// what gets it `balls`/`slices`/`used` — the public read carries `remaining`
// alone. A dough assertion therefore has to say which of the two it means.
const getStoreAdmin = () => call(base, '/api/store', { headers: { Cookie: cookie } });
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

  it('reports balls, the slices they make, and what is left to the board', async () => {
    await patchStore({ dough: { [DOUGH_TYPE]: 2 } });
    const { body } = await getStoreAdmin();
    expect(body.dough[DOUGH_TYPE]).toEqual({
      balls: 2, slices: 2 * PER_BALL, used: 0, remaining: 2 * PER_BALL,
    });
  });

  it('tells an anonymous reader what is left and nothing else', async () => {
    await patchStore({ dough: { [DOUGH_TYPE]: 2 } });
    const { body } = await getStore();
    // Inventory plus a running slices-sold count is a rough revenue figure,
    // refreshed on every poll. Only `remaining` greys a slice out, so only
    // `remaining` goes out unauthenticated.
    expect(body.dough[DOUGH_TYPE]).toEqual({ remaining: 2 * PER_BALL });
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
    expect(body.dough[DOUGH_TYPE].remaining).toBe(PER_BALL - 2);
    expect((await getStoreAdmin()).body.dough[DOUGH_TYPE].used).toBe(2);
  });

  it('keeps an uncounted dough absent from the public read too', async () => {
    await patchStore({ dough: { [DOUGH_TYPE]: 2 } });
    const { body } = await getStore();
    // Absent still has to mean "not tracking" after the scrub — a `{}` or a
    // `{remaining: 0}` here would grey the slice out on a pool nobody counted.
    for (const type of DOUGH_TYPES) {
      if (type !== DOUGH_TYPE) expect(body.dough[type]).toBeUndefined();
    }
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
    expect((await getStoreAdmin()).body.dough[DOUGH_TYPE].balls).toBe(2);
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
    const { body } = await getStoreAdmin();
    expect(body.open).toBe(false);
    expect(body.dough[DOUGH_TYPE].balls).toBe(3);
  });

  // A count is the night's running total, and the slices-sold counter is never
  // rebased against it. Typing "2" after two more balls came out of the oven
  // therefore doesn't add dough — it sets capacity below what's already gone,
  // floors `remaining` at 0 and 86s the pool site-wide while intake starts
  // 409ing. The panel's only clue would be a nonsensical "24 of 16 sold".
  describe('a total below what is already sold', () => {
    // Spread across orders of two, since the per-item cap (DEFAULT_MAX_QTY,
    // or a lower `maxQty` on this slice) would reject a single line big
    // enough to empty a pool.
    async function sell(slices) {
      for (let left = slices; left > 0; left -= 2) {
        const { status } = await call(base, '/api/orders', {
          method: 'POST',
          headers: { Cookie: cookie },
          body: { name: 'Test Customer', items: [{ name: DOUGH_ITEM.name, qty: Math.min(2, left) }] },
        });
        expect(status).toBe(201);
      }
    }

    it('is refused, and names the count that has to be cleared', async () => {
      await patchStore({ dough: { [DOUGH_TYPE]: 2 } });
      await sell(PER_BALL + 2); // more than one ball's worth is gone
      const { status, body } = await patchStore({ dough: { [DOUGH_TYPE]: 1 } });
      expect(status).toBe(400);
      expect(body.error).toMatch(new RegExp(`${PER_BALL + 2} slices`));
      // Refused whole, like every other bad dough patch: the board keeps
      // selling against the count it had rather than the one just refused.
      expect((await getStoreAdmin()).body.dough[DOUGH_TYPE].balls).toBe(2);
    });

    it('accepts a total that exactly covers what is sold', async () => {
      await patchStore({ dough: { [DOUGH_TYPE]: 2 } });
      await sell(PER_BALL);
      // Sold exactly one ball's worth, so one ball is a legitimate total —
      // it means "that's all we're making tonight", not a miscount.
      const { status, body } = await patchStore({ dough: { [DOUGH_TYPE]: 1 } });
      expect(status).toBe(200);
      expect(body.dough[DOUGH_TYPE]).toMatchObject({ balls: 1, remaining: 0 });
    });

    it('still lets staff stop counting the pool entirely', async () => {
      await patchStore({ dough: { [DOUGH_TYPE]: 2 } });
      await sell(PER_BALL + 2);
      // Untracking is the documented way out of a miscount, so it must not be
      // caught by the same guard — an omitted type carries no total to check.
      const { status, body } = await patchStore({ dough: {} });
      expect(status).toBe(200);
      expect(body.dough).toEqual({});
    });
  });

  it('leaves the 86 list alone, and vice versa', async () => {
    await patchStore({ dough: { [DOUGH_TYPE]: 3 } });
    await patchStore({ availability: { name: DOUGH_ITEM.name, unavailable: true } });
    const { body } = await getStoreAdmin();
    expect(body.unavailable).toContain(DOUGH_ITEM.name);
    expect(body.dough[DOUGH_TYPE].balls).toBe(3);
  });
});

// Closing the night clears the ball count, but that reset is best-effort and
// a night nobody closes never runs it. pp:settings never expires, so without
// an age limit on the count itself, next Saturday would open selling against
// last week's balls next to a slices-sold counter whose TTL *had* run out.
describe('a ball count from an earlier night', () => {
  afterEach(() => vi.restoreAllMocks());

  const later = (ms) => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + ms);
  };

  it('reads as untracked once it outlives the orders it was counted for', async () => {
    await patchStore({ dough: { [DOUGH_TYPE]: 0 } }); // sold out
    later(ORDER_TTL_SECONDS * 1000 + 1);
    expect((await getStoreAdmin()).body.dough).toEqual({});
    // And intake agrees with the readout: the stale zero no longer refuses.
    const { status } = await call(base, '/api/orders', {
      method: 'POST', headers: { Cookie: cookie },
      body: { name: 'Next Week', items: [{ name: DOUGH_ITEM.name, qty: 1 }] },
    });
    expect(status).toBe(201);
  });

  it('still holds within the night it was counted for', async () => {
    await patchStore({ dough: { [DOUGH_TYPE]: 0 } });
    later(6 * 60 * 60 * 1000); // a long service
    expect((await getStoreAdmin()).body.dough[DOUGH_TYPE].balls).toBe(0);
  });
});
