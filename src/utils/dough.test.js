import { describe, expect, it } from 'vitest';
import { MENU_DATA } from '../data/menu.js';
import {
  DOUGH_BY_ITEM, DOUGH_TYPES, SLICES_PER_BALL,
  doughSlicesFor, doughStatus, doughRemaining, isDoughType, soldOutNames,
} from './dough.js';

// Derived, never typed — a renamed slice must not quietly send these cases
// down an unknown-item path where they keep passing while proving nothing.
const SLICE = MENU_DATA.flatMap((s) => s.items).find((i) => isDoughType(i.dough));
const ADDON = MENU_DATA.flatMap((s) => s.items).find((i) => !isDoughType(i.dough));

describe('the menu shape these cases rely on', () => {
  it('has at least one slice tied to a dough and one item without', () => {
    expect(SLICE).toBeDefined();
    expect(ADDON).toBeDefined();
    expect(DOUGH_BY_ITEM.size).toBeGreaterThan(0);
  });

  it('gives every dough type a slices-per-ball figure', () => {
    for (const type of DOUGH_TYPES) expect(SLICES_PER_BALL[type]).toBeGreaterThan(0);
  });
});

describe('doughSlicesFor', () => {
  it('totals a cart by dough pool', () => {
    expect(doughSlicesFor([{ name: SLICE.name, qty: 3 }])).toEqual({ [SLICE.dough]: 3 });
  });

  it('adds up several lines of the same dough', () => {
    const sameDough = MENU_DATA.flatMap((s) => s.items)
      .filter((i) => i.dough === SLICE.dough).slice(0, 2);
    const total = doughSlicesFor(sameDough.map((i) => ({ name: i.name, qty: 2 })));
    expect(total[SLICE.dough]).toBe(2 * sameDough.length);
  });

  it('ignores items that consume no dough', () => {
    expect(doughSlicesFor([{ name: ADDON.name, qty: 5 }])).toEqual({});
  });

  it('trusts the dough recorded on a stored line over the live menu', () => {
    // An order placed before a slice was re-pointed at another dough has to
    // refund the pool it actually came out of.
    const other = DOUGH_TYPES.find((t) => t !== SLICE.dough) ?? SLICE.dough;
    expect(doughSlicesFor([{ name: SLICE.name, dough: other, qty: 2 }])).toEqual({ [other]: 2 });
  });

  it('skips junk quantities rather than producing NaN', () => {
    expect(doughSlicesFor([
      { name: SLICE.name, qty: 0 },
      { name: SLICE.name, qty: -2 },
      { name: SLICE.name, qty: 'two' },
    ])).toEqual({});
  });
});

describe('doughStatus', () => {
  const type = DOUGH_TYPES[0];
  const perBall = SLICES_PER_BALL[type];

  it('turns balls into slices and subtracts what is spent', () => {
    expect(doughStatus({ [type]: 2 }, { [type]: 3 })).toEqual({
      [type]: { balls: 2, slices: 2 * perBall, used: 3, remaining: 2 * perBall - 3 },
    });
  });

  // The distinction the feature rests on. Absent = "not counting" = unlimited;
  // zero = "none left". Collapsing them either refuses every order on a night
  // nobody counted dough, or sells from an empty pool.
  it('omits a dough nobody counted, and keeps a zero that was counted', () => {
    expect(doughStatus({}, {})).toEqual({});
    expect(doughStatus({ [type]: 0 }, {})[type]).toMatchObject({ balls: 0, remaining: 0 });
  });

  it('never reports a negative remainder', () => {
    expect(doughStatus({ [type]: 1 }, { [type]: perBall + 5 })[type].remaining).toBe(0);
  });

  it('reports untracked as null rather than a number', () => {
    const status = doughStatus({ [type]: 1 }, {});
    expect(doughRemaining(status, type)).toBe(perBall);
    expect(doughRemaining(status, 'sourdough')).toBeNull();
  });
});

describe('soldOutNames', () => {
  it('keeps the manual 86 list', () => {
    expect(soldOutNames({ unavailable: [ADDON.name], dough: {} })).toEqual(new Set([ADDON.name]));
  });

  it('adds every slice whose dough has run out', () => {
    const out = soldOutNames({
      unavailable: [],
      dough: { [SLICE.dough]: { balls: 1, slices: 8, used: 8, remaining: 0 } },
    });
    expect(out.has(SLICE.name)).toBe(true);
    // Only that dough's slices — an add-on isn't cut from a ball.
    expect(out.has(ADDON.name)).toBe(false);
  });

  it('leaves a slice orderable while its pool still has one left', () => {
    const out = soldOutNames({
      unavailable: [],
      dough: { [SLICE.dough]: { balls: 1, slices: 8, used: 7, remaining: 1 } },
    });
    expect(out.has(SLICE.name)).toBe(false);
  });

  it('says nothing is sold out when no store info has arrived yet', () => {
    expect(soldOutNames(null)).toEqual(new Set());
    expect(soldOutNames({})).toEqual(new Set());
  });
});
