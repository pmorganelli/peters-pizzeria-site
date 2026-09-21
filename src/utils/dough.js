// Dough stock — the "how many slices can we actually sell tonight" counter.
//
// Shared between the client pages and the api/ functions, like utils/orders.js
// (and, like it, kept free of React/GSAP imports so a handler can pull it in
// under plain Node).
//
// Staff count dough *balls* at the start of the night, not slices: a ball is
// the unit that exists in the fridge. Slices are what gets sold, so everything
// downstream of the admin panel works in slices and this module is the one
// place the two units meet.

import { MENU_DATA } from '../data/menu.js';

// A ball of each dough yields this many slices. New York rounds get cut into
// eighths, Neapolitan into fourths — the whole point of tracking two pools
// rather than one number, since a ball of one is not worth a ball of the other.
export const SLICES_PER_BALL = { ny: 8, neapolitan: 4 };
export const DOUGH_TYPES = Object.keys(SLICES_PER_BALL);
export const DOUGH_LABELS = { ny: 'New York', neapolitan: 'Neapolitan' };

// A sanity ceiling on the admin input, not a real constraint — it exists so a
// slipped keypress ("300" for "3") can't quietly set the night's capacity to
// 2400 slices and turn the whole feature off for the evening.
export const MAX_DOUGH_BALLS = 200;

export const isDoughType = (value) => Object.hasOwn(SLICES_PER_BALL, value);

// Menu item name → which dough it's cut from. Items with no `dough` field
// (add-ons, and anything that isn't a slice) are absent, and absent means
// "consumes no dough" everywhere below.
export const DOUGH_BY_ITEM = new Map(
  MENU_DATA.flatMap((section) =>
    section.items.flatMap((item) => (isDoughType(item.dough) ? [[item.name, item.dough]] : []))),
);

// Slices consumed per dough type by a set of order lines — `{ ny: 3 }`.
//
// Reads `dough` off the line when it has one and falls back to the live menu
// otherwise. Order lines are stamped with their dough at intake (see
// api/_lib/catalog.js), so an order placed before a slice was re-pointed at
// another dough keeps refunding the pool it actually drew from; the menu
// lookup is for carts on the client, which are only ever item names.
//
// Add-ons are skipped by construction — they carry no dough, because adding
// burrata to a slice does not consume another slice.
export function doughSlicesFor(lines) {
  const counts = {};
  for (const line of lines ?? []) {
    const dough = isDoughType(line.dough) ? line.dough : DOUGH_BY_ITEM.get(line.name);
    const qty = Number(line.qty);
    if (!dough || !Number.isFinite(qty) || qty <= 0) continue;
    counts[dough] = (counts[dough] ?? 0) + qty;
  }
  return counts;
}

// Tonight's stock as the admin panel and the order page want to read it:
// balls in, slices they make, slices already committed, slices left.
//
// A dough type the admin hasn't entered is **absent from the result**, and
// that absence is load-bearing — it means "not tracking this", which is what
// every consumer treats as unlimited. `0` is a real answer meaning sold out,
// so the two must never collapse into each other.
export function doughStatus(stock, used) {
  const status = {};
  for (const dough of DOUGH_TYPES) {
    const balls = stock?.[dough];
    if (!Number.isFinite(balls)) continue;
    const slices = balls * SLICES_PER_BALL[dough];
    const spent = Math.max(0, Number(used?.[dough]) || 0);
    status[dough] = {
      balls,
      slices,
      used: spent,
      remaining: Math.max(0, slices - spent),
    };
  }
  return status;
}

// How many more slices of `dough` can be sold. `null` = untracked, i.e. no
// limit — deliberately not `Infinity`, so a caller that forgets to handle it
// fails visibly rather than silently allowing everything.
export const doughRemaining = (status, dough) =>
  (status?.[dough] ? status[dough].remaining : null);

// Every menu item name that can't be ordered right now: the manual 86 list,
// plus every slice whose dough pool has run dry.
//
// One helper rather than each page spreading `unavailable` into its own Set,
// because "sold out" now has two independent sources and a page that knew
// about only one of them would keep offering slices there is no dough for.
export function soldOutNames(storeInfo) {
  const names = new Set(storeInfo?.unavailable ?? []);
  const status = storeInfo?.dough ?? {};
  for (const [name, dough] of DOUGH_BY_ITEM) {
    if (status[dough] && status[dough].remaining <= 0) names.add(name);
  }
  return names;
}
