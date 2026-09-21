import { MENU_DATA } from '../../src/data/menu.js';
import { parsePriceCents, DEFAULT_MAX_QTY } from '../../src/utils/orders.js';
import { isDoughType } from '../../src/utils/dough.js';

// The menu in src/data/menu.js is the single source of truth for what can be
// ordered and at what price. Prices are parsed to integer cents here so order
// totals are always computed server-side — the client never sets a price.

let cached = null;

export function catalog() {
  if (cached) return cached;
  cached = new Map();
  for (const section of MENU_DATA) {
    for (const item of section.items) {
      const cents = parsePriceCents(item.price);
      if (Number.isFinite(cents)) {
        cached.set(item.name, {
          name: item.name, category: section.category, priceCents: cents,
          maxQty: item.maxQty ?? DEFAULT_MAX_QTY,
          // Stamped onto the order line at intake so the dough an order drew
          // from travels with it. A slice re-pointed at the other pool later
          // must still refund the one it actually came out of when it's
          // cancelled — the live menu would give the new answer.
          dough: isDoughType(item.dough) ? item.dough : null,
        });
      }
    }
  }
  return cached;
}

export const PIZZA_CATEGORY = MENU_DATA[0].category; // "Saturday Slices" — what the oven fires
export const ADDON_CATEGORY = MENU_DATA[1].category; // "Add Ons" — attachable to slices
