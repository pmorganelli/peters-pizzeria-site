import { describe, expect, it } from 'vitest';
import { addonLabel, clampCartQty, fireNextCounts, formatOrderItems, givenQty, groupOrderLines, orderProgress } from './orders.js';
import { MENU_DATA } from '../data/menu.js';

// These cases are about a *relationship* — does this slice's description
// already mention this add-on's ingredient — so they pick their subjects by
// that property instead of naming a slice. Naming one is how they rotted the
// last time the menu was edited: "Cheese Slice" was renamed, every lookup
// started returning undefined, and the tests kept passing down the
// unknown-item fallback while claiming to prove something else entirely.
const ITEMS = MENU_DATA.flatMap((s) => s.items);
const withKeyword = (kw) => ITEMS.find((i) => i.desc?.toLowerCase().includes(kw));
const withoutKeyword = (kw) => ITEMS.find((i) => i.desc && !i.desc.toLowerCase().includes(kw));

describe('addonLabel', () => {
  // If the menu ever stops offering a slice on either side of these
  // relationships, fail loudly here rather than letting the cases below pass
  // vacuously through the unknown-item path.
  it('has menu items to exercise both branches', () => {
    expect(withKeyword('stracciatella')).toBeDefined();
    expect(withoutKeyword('stracciatella')).toBeDefined();
    expect(withKeyword('parm')).toBeDefined();
  });

  it('reads as "Extra X" when the slice already contains that ingredient', () => {
    const hasIt = withKeyword('stracciatella').name;
    expect(addonLabel('+ Stracciatella', hasIt)).toBe('Extra Stracciatella');
    const hasHoney = withKeyword('hot honey');
    if (hasHoney) expect(addonLabel('+ Hot Honey', hasHoney.name)).toBe('Extra Hot Honey');
  });

  it('stays plain when the slice does not already contain the ingredient', () => {
    const lacksIt = withoutKeyword('stracciatella').name;
    expect(addonLabel('+ Stracciatella', lacksIt)).toBe('Stracciatella');
    const lacksHoney = withoutKeyword('hot honey');
    if (lacksHoney) expect(addonLabel('+ Hot Honey', lacksHoney.name)).toBe('Hot Honey');
  });

  it('does not double up "Extra" when the add-on name already says it', () => {
    // A slice whose desc matches the '+ Extra Parm' add-on's keyword ('parm').
    // The label must stay "Extra Parm", not become "Extra Extra Parm" — and
    // the subject must genuinely match, or this stops testing the guard.
    const parmy = withKeyword('parm');
    expect(parmy.desc.toLowerCase()).toContain('parm');
    expect(addonLabel('+ Extra Parm', parmy.name)).toBe('Extra Parm');
  });

  it('falls back to the plain display name for an unknown item or add-on', () => {
    expect(addonLabel('+ Stracciatella', 'Not A Real Item')).toBe('Stracciatella');
    expect(addonLabel('+ Not A Real Addon', "Chef's Choice")).toBe('Not A Real Addon');
  });
});

describe('formatOrderItems', () => {
  it('joins qty, name, and add-ons into one readable line', () => {
    const items = [
      { name: 'Cheese Slice', qty: 2 },
      { name: "Chef's Choice", qty: 1, addons: [{ name: '+ Stracciatella', priceCents: 100 }] },
    ];
    expect(formatOrderItems(items)).toBe("2× Cheese Slice, 1× Chef's Choice (+ Extra Stracciatella)");
  });

  it('handles an item with no add-ons field at all (legacy orders)', () => {
    expect(formatOrderItems([{ name: 'Tiramisu', qty: 1 }])).toBe('1× Tiramisu');
  });
});

// These name real menu items on purpose — the cap comes from `maxQty` in
// menu.js, so an item the menu doesn't sell silently falls back to the default
// and stops testing what the case claims. Picked by property for that reason.
const CAPPED = ITEMS.find((i) => i.maxQty !== undefined);
const UNCAPPED = ITEMS.find((i) => i.maxQty === undefined);

describe('clampCartQty', () => {
  it('has a capped and an uncapped menu item to work with', () => {
    expect(CAPPED).toBeDefined();
    expect(UNCAPPED).toBeDefined();
  });

  it('leaves a cart within every item\'s cap untouched', () => {
    const cart = {
      [UNCAPPED.name]: [[], []],
      [CAPPED.name]: Array.from({ length: CAPPED.maxQty }, () => []),
    };
    expect(clampCartQty(cart)).toEqual(cart);
  });

  it('trims an item down to its own maxQty, from the end', () => {
    const overflow = ['+ Extra Basil'];
    const units = [...Array.from({ length: CAPPED.maxQty }, () => []), overflow];
    expect(clampCartQty({ [CAPPED.name]: units })).toEqual({
      [CAPPED.name]: Array.from({ length: CAPPED.maxQty }, () => []),
    });
  });

  it('applies the default cap (8) to an item with no explicit maxQty', () => {
    const nineUnits = Array.from({ length: 9 }, () => []);
    const clamped = clampCartQty({ [UNCAPPED.name]: nineUnits });
    expect(clamped[UNCAPPED.name]).toHaveLength(8);
  });

  it('drops an item with an empty unit array rather than keeping a stray key', () => {
    expect(clampCartQty({ [CAPPED.name]: [] })).toEqual({});
  });
});

describe('groupOrderLines', () => {
  const SLICE_CAT = MENU_DATA[0].category;
  const [A, B] = MENU_DATA[0].items;
  const [X, Y] = MENU_DATA[1].items;
  const line = (item, qty, addons = []) => ({
    name: item.name, category: SLICE_CAT, qty, priceCents: 100, addons: addons.map((a) => ({ name: a.name, priceCents: 50 })),
  });

  it('has two slices and two add-ons to group with', () => {
    expect([A, B, X, Y].every(Boolean)).toBe(true);
  });

  it('folds one slice split across add-on combinations into one entry with its variations', () => {
    const [cheese, other] = groupOrderLines([line(A, 2), line(B, 1), line(A, 1, [X, Y])]);
    expect(cheese).toMatchObject({ name: A.name, qty: 3, addons: [] });
    expect(cheese.variants).toMatchObject([
      { qty: 2, addons: [] },
      { qty: 1, addons: [addonLabel(X.name, A.name), addonLabel(Y.name, A.name)] },
    ]);
    expect(cheese.variants).toHaveLength(2);
    // Order of first appearance, not alphabetical — matches how it was rung up.
    expect(other).toMatchObject({ name: B.name, qty: 1, variants: [] });
  });

  it('keeps add-ons on the entry itself when every unit shares them', () => {
    const [only] = groupOrderLines([line(A, 2, [X])]);
    expect(only).toMatchObject({ qty: 2, addons: [addonLabel(X.name, A.name)], variants: [] });
  });

  it('lists the biggest variation first', () => {
    const [g] = groupOrderLines([line(A, 1, [X]), line(A, 3)]);
    expect(g.variants.map((v) => v.qty)).toEqual([3, 1]);
  });

  it('carries the stored line with each entry, since that is what a hand-over is recorded against', () => {
    const plain = line(A, 2);
    const dressed = line(A, 1, [X]);
    const solo = line(B, 1);
    const [split, single] = groupOrderLines([plain, dressed, solo]);
    expect(split.item).toBeUndefined(); // a heading over its variations, not a line
    expect(split.variants.map((v) => v.item)).toEqual([plain, dressed]);
    expect(single.item).toBe(solo);
  });

  it('totals what has been handed over per slice and per variation', () => {
    const [g] = groupOrderLines([{ ...line(A, 2), given: 1 }, { ...line(A, 1, [X]), given: 1 }]);
    expect(g).toMatchObject({ qty: 3, given: 2 });
    expect(g.variants.map((v) => v.given)).toEqual([1, 1]);
  });
});

describe('partial pickup', () => {
  const SLICE_CAT = MENU_DATA[0].category;
  const [A, B] = MENU_DATA[0].items;
  const [X] = MENU_DATA[1].items;
  const line = (item, qty, given, addons = []) => ({
    name: item.name, category: SLICE_CAT, qty, priceCents: 100,
    ...(given === undefined ? {} : { given }),
    ...(addons.length ? { addons: addons.map((a) => ({ name: a.name, priceCents: 50 })) } : {}),
  });

  it('reads a missing, malformed or negative count as nothing handed over', () => {
    for (const given of [undefined, null, 'two', -1, 1.5, NaN]) {
      expect(givenQty({ qty: 3, given })).toBe(0);
    }
    expect(givenQty({ qty: 3, given: 2 })).toBe(2);
  });

  it('never reads more handed over than the line has', () => {
    expect(givenQty({ qty: 2, given: 9 })).toBe(2);
  });

  it('is partial only between none and all', () => {
    expect(orderProgress([line(A, 2), line(B, 1)])).toEqual({ total: 3, given: 0, partial: false });
    expect(orderProgress([line(A, 2, 1), line(B, 1)])).toEqual({ total: 3, given: 1, partial: true });
    expect(orderProgress([line(A, 2, 2), line(B, 1, 1)])).toEqual({ total: 3, given: 3, partial: false });
    expect(orderProgress(undefined)).toEqual({ total: 0, given: 0, partial: false });
  });

  describe('fireNextCounts', () => {
    const order = (items, over = {}) => ({ id: 'o', status: 'new', createdAt: 1000, items, ...over });

    it('counts only waiting orders, and their add-ons once per slice', () => {
      const out = fireNextCounts([
        order([line(A, 2, undefined, [X]), line(B, 1)]),
        order([line(A, 3)], { status: 'firing' }),
      ]);
      expect(out.pizzas).toEqual([[A.name, 2], [B.name, 1]]);
      expect(out.addons).toEqual([[X.name, 2]]);
      expect(out.waiting).toBe(1);
    });

    it('leaves out slices already handed over, add-ons and all', () => {
      const out = fireNextCounts([order([line(A, 3, 2, [X]), line(B, 1, 1)])]);
      expect(out.pizzas).toEqual([[A.name, 1]]);
      expect(out.addons).toEqual([[X.name, 1]]);
      // Still one order waiting — it has a slice to make.
      expect(out.waiting).toBe(1);
    });

    it('reports an empty oven queue for no orders or none loaded yet', () => {
      expect(fireNextCounts(null)).toEqual({ pizzas: [], addons: [], waiting: 0, oldest: null });
      expect(fireNextCounts([order([line(A, 1)], { status: 'ready' })]).waiting).toBe(0);
    });
  });
});
