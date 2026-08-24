import { describe, expect, it } from 'vitest';
import { addonLabel, clampCartQty, formatOrderItems } from './orders.js';
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
