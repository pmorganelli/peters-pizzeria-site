import { beforeEach, describe, expect, it } from 'vitest';
import { resetEnv } from '../../tests/helpers/env.js';
import {
  MAX_LIVE_ORDERS, clearOrders, createOrder, getOrder, getOrderByCode,
  getSettings, listOrders, patchSettings, saveSettings,
} from './store.js';

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

describe('createOrder reservations and capacity', () => {
  it('reserves a pickup code for only one live order', async () => {
    expect((await createOrder(order('first', { code: 'ABCD' }))).created).toBe(true);
    expect(await createOrder(order('second', { code: 'ABCD' }))).toEqual({ reason: 'code_conflict' });
    expect((await getOrderByCode('ABCD')).id).toBe('first');
  });

  it('backfills the reservation for an order written before code indexes existed', async () => {
    await createOrder(order('legacy', { code: 'WXYZ' }));
    globalThis.__ppOrderCodeStore.clear();
    expect((await getOrderByCode('WXYZ')).id).toBe('legacy');
    globalThis.__ppOrderCodeStore.clear();
    expect(await createOrder(order('collision', { code: 'WXYZ' }))).toEqual({ reason: 'code_conflict' });
  });

  it('refuses overflow instead of hiding accepted orders', async () => {
    for (let i = 0; i < MAX_LIVE_ORDERS; i += 1) {
      const stored = await createOrder(order(`order-${i}`, { code: `code-${i}` }));
      expect(stored.created).toBe(true);
    }
    expect(await createOrder(order('overflow', { code: 'overflow' }))).toEqual({ reason: 'capacity' });
    expect(await listOrders()).toHaveLength(MAX_LIVE_ORDERS);
  });
});

describe('patchSettings', () => {
  it('preserves independent concurrent field updates', async () => {
    await Promise.all([
      patchSettings({ mode: 'closed' }),
      patchSettings({ availability: { name: 'Test Item', unavailable: true } }),
    ]);
    const settings = await getSettings();
    expect(settings.mode).toBe('closed');
    expect(settings.unavailable).toContain('Test Item');
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

describe('getSettings — empty 86 list written by the Redis path', () => {
  // Redis's cjson cannot tell an empty array from an empty table, so
  // PATCH_SETTINGS_LUA serialises an empty `unavailable` as a JSON *object*.
  // That is the shape stored here by hand: normalizeSettings has to hand back
  // a real array regardless, because every consumer spreads this into
  // `new Set(...)` and `new Set({})` throws. When this broke, the first
  // storefront save on a fresh deploy 500'd all order intake and crashed the
  // order page and the admin board — persistently, since the next read
  // decoded the same object again.
  it('coerces a non-array unavailable back to an array', async () => {
    await saveSettings({ mode: 'open', unavailable: {} });
    const settings = await getSettings();
    expect(Array.isArray(settings.unavailable)).toBe(true);
    expect(settings.unavailable).toEqual([]);
    expect(() => new Set(settings.unavailable)).not.toThrow();
  });

  it('leaves a populated 86 list alone', async () => {
    await saveSettings({ mode: 'open', unavailable: ['Something'] });
    expect((await getSettings()).unavailable).toEqual(['Something']);
  });
});
