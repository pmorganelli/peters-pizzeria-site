import { beforeEach, describe, expect, it } from 'vitest';
import { resetEnv } from '../../tests/helpers/env.js';
import { createOrder, getOrder, listOrders, clearOrders } from './store.js';

// These exercise the in-memory fallback only (no Redis env configured, same
// as local dev) — see CLAUDE.md's Testing section for why the Redis-backed
// path isn't covered here.
beforeEach(() => {
  resetEnv();
});

const order = (id, overrides = {}) => ({
  id, code: id, name: 'Test', items: [], totalCents: 0, status: 'new', createdAt: Date.now(), ...overrides,
});

describe('listOrders', () => {
  it('orders newest first', async () => {
    await createOrder(order('a', { createdAt: 1000 }));
    await createOrder(order('b', { createdAt: 3000 }));
    await createOrder(order('c', { createdAt: 2000 }));
    expect((await listOrders()).map((o) => o.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('clearOrders', () => {
  it('removes only the given ids, leaving everything else on the board', async () => {
    // The scenario this guards: "close for the night" archives a snapshot,
    // then must clear exactly that snapshot — not whatever's live by the time
    // the clear actually runs, or an order placed in between gets destroyed
    // without ever being archived.
    await createOrder(order('archived-1'));
    await createOrder(order('archived-2'));
    await createOrder(order('placed-during-close'));

    await clearOrders(['archived-1', 'archived-2']);

    expect(await getOrder('archived-1')).toBeNull();
    expect(await getOrder('archived-2')).toBeNull();
    const survivor = await getOrder('placed-during-close');
    expect(survivor).not.toBeNull();
    expect(survivor.id).toBe('placed-during-close');
  });

  it('is a no-op given an empty id list', async () => {
    await createOrder(order('a'));
    await clearOrders([]);
    expect(await getOrder('a')).not.toBeNull();
  });
});
