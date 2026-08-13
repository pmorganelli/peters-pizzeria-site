import { describe, expect, it } from 'vitest';
import { addonLabel, clampCartQty, formatOrderItems } from './orders.js';

describe('addonLabel', () => {
  it('reads as "Extra X" when the slice already contains that ingredient', () => {
    expect(addonLabel('+ Stracciatella', "Chef's Choice")).toBe('Extra Stracciatella');
    expect(addonLabel('+ Hot Honey', "Chef's Choice")).toBe('Extra Hot Honey');
  });

  it('stays plain when the slice does not already contain the ingredient', () => {
    expect(addonLabel('+ Stracciatella', 'Cheese Slice')).toBe('Stracciatella');
    expect(addonLabel('+ Hot Honey', 'Margherita')).toBe('Hot Honey');
  });

  it('does not double up "Extra" when the add-on name already says it', () => {
    // Cheese Slice's desc contains "parmigiano reggiano", which matches the
    // '+ Extra Parm' add-on's keyword ('parm') — the label must stay
    // "Extra Parm", not become "Extra Extra Parm".
    expect(addonLabel('+ Extra Parm', 'Cheese Slice')).toBe('Extra Parm');
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

describe('clampCartQty', () => {
  it('leaves a cart within every item\'s cap untouched', () => {
    const cart = { 'Cheese Slice': [[], []], Margherita: [[], [], [], []] };
    expect(clampCartQty(cart)).toEqual(cart);
  });

  it('trims an item down to its own maxQty, from the end', () => {
    const fifth = ['+ Extra Basil'];
    const cart = { Margherita: [[], [], [], [], fifth] }; // 5 units, cap is 4
    expect(clampCartQty(cart)).toEqual({ Margherita: [[], [], [], []] });
  });

  it('applies the default cap (8) to an item with no explicit maxQty', () => {
    const nineUnits = Array.from({ length: 9 }, () => []);
    const clamped = clampCartQty({ Pepperoni: nineUnits });
    expect(clamped.Pepperoni).toHaveLength(8);
  });

  it('drops an item with an empty unit array rather than keeping a stray key', () => {
    expect(clampCartQty({ Margherita: [] })).toEqual({});
  });
});
