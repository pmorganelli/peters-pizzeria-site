// Shared between the client pages and the api/ functions (the API imports
// parsePriceCents so prices are computed from one implementation).

import { MENU_DATA } from '../data/menu.js';

// Per-slice order cap. Most slices allow up to this many; an item can set its
// own lower `maxQty` in menu.js (e.g. Margherita, capped at 4).
export const DEFAULT_MAX_QTY = 8;
const MAX_QTY_BY_NAME = new Map(MENU_DATA.flatMap((s) => s.items.map((it) => [it.name, it.maxQty ?? DEFAULT_MAX_QTY])));

// Caps each item's units to its current maxQty. Used both to migrate the
// legacy flat-{name: qty} cart shape and to re-clamp a persisted cart that
// predates a maxQty change (or a since-lowered one) — without this, a
// stepper that won't grow past its own stale cap still submits an over-cap
// total, and checkout fails with a confusing generic error instead of the
// cart just reading correctly on load.
export function clampCartQty(cart) {
  const clamped = {};
  for (const [name, units] of Object.entries(cart)) {
    if (!Array.isArray(units) || units.length === 0) continue;
    clamped[name] = units.slice(0, MAX_QTY_BY_NAME.get(name) ?? DEFAULT_MAX_QTY);
  }
  return clamped;
}

export function parsePriceCents(label) {
  const s = String(label).replace('+', '').trim();
  if (/^free$/i.test(s)) return 0;
  if (s.endsWith('¢')) return Math.round(Number(s.slice(0, -1)));
  if (s.startsWith('$')) return Math.round(Number(s.slice(1)) * 100);
  return NaN;
}

export const fmtMoney = (cents) =>
  cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;

export const STATUS_LABELS = {
  new: 'Received',
  firing: 'In the oven',
  ready: 'Ready for pickup',
  done: 'Picked up',
  cancelled: 'Cancelled',
};

// Menu add-ons are named "+ Burrata" etc.; strip the prefix when the name
// appears after a quantity ("2 × + Burrata" reads badly).
export const displayName = (name) => String(name).replace(/^\+\s*/, '');

const ITEM_DESC_BY_NAME = new Map(MENU_DATA.flatMap((s) => s.items.map((it) => [it.name, it.desc])));
const ADDON_KEYWORD_BY_NAME = new Map(MENU_DATA.flatMap((s) => s.items.map((it) => [it.name, it.keyword])));

// An add-on's display name, adjusted for the slice it's attached to: if the
// slice's own description already includes that ingredient (e.g. stracciatella
// on Chef's Choice), the add-on reads as "Extra X" there instead of plain "X".
export function addonLabel(addonName, itemName) {
  const label = displayName(addonName);
  const keyword = ADDON_KEYWORD_BY_NAME.get(addonName);
  const desc = ITEM_DESC_BY_NAME.get(itemName);
  if (keyword && desc && desc.toLowerCase().includes(keyword) && !/^extra\b/i.test(label)) {
    return `Extra ${label}`;
  }
  return label;
}


// One order line's total: (slice + its add-ons) × qty. Add-ons are nested
// on the line ({ name, priceCents }) — legacy orders have none.
export const itemTotalCents = (it) =>
  (it.priceCents + (it.addons ?? []).reduce((sum, a) => sum + a.priceCents, 0)) * it.qty;

// A stable React key for one order line. Cart-building already merges any
// units sharing both name and add-ons into a single line, so name+addons
// uniquely identifies a line within an order — no index needed.
export const orderLineKey = (it) =>
  `${it.name}::${(it.addons ?? []).map((a) => a.name).join(',')}`;

// ── Partial pickup ────────────────────────────────────────────────────
// Slices come out of the oven a pie at a time, so an order for a cheese and a
// pepperoni often has one ready before the other — and the window hands that
// one over rather than making the customer wait. Each stored line carries how
// many of its slices have gone out (`given`, absent meaning none), and
// "partial" is *derived* from those counts rather than being a status of its
// own: the order's status keeps describing the slices still owed, which is the
// thing the kitchen needs to read off the board.
//
// Clamped on read, because the count is only as trustworthy as the line it
// sits on — a `given` larger than `qty` would make an order read as more than
// finished.
export const givenQty = (it) => {
  const n = Number(it?.given);
  return Number.isInteger(n) && n > 0 ? Math.min(n, it.qty) : 0;
};

// { total, given, partial } across every line of an order.
export function orderProgress(items) {
  let total = 0;
  let given = 0;
  for (const it of items ?? []) {
    total += it.qty;
    given += givenQty(it);
  }
  return { total, given, partial: given > 0 && given < total };
}

// An order's lines regrouped for the kitchen: one entry per slice, in the
// order it first appears, with the total count up front. An order is stored as
// one line per slice *and* add-on combination, so "3 Cheese, one with hot
// honey" arrives as two lines — `2× Cheese` and `1× Cheese + Hot Honey` —
// which reads as two different things on a busy board. Here it becomes
// `3× Cheese` with the variations underneath.
//
//   { name, qty, given, addons, variants, item }
//   - every unit has the same add-ons → `addons` holds their labels (possibly
//     empty), `variants` is empty, and `item` is the stored line itself;
//   - mixed → `addons` is empty and `variants` lists { qty, given, addons,
//     item } per combination, plain units (addons: []) included, so the counts
//     add up.
// `item` is what a hand-over is recorded against: a slice is given out per
// stored line, not per folded entry, because the one with hot honey is a
// different physical slice from the plain ones beside it.
export function groupOrderLines(items) {
  const groups = new Map();
  for (const it of items) {
    const labels = (it.addons ?? []).map((a) => addonLabel(a.name, it.name));
    const g = groups.get(it.name) ?? { name: it.name, category: it.category, qty: 0, given: 0, lines: [] };
    g.qty += it.qty;
    g.given += givenQty(it);
    g.lines.push({ qty: it.qty, given: givenQty(it), addons: labels, item: it });
    groups.set(it.name, g);
  }
  return [...groups.values()].map(({ lines, ...g }) => (lines.length === 1
    ? { ...g, addons: lines[0].addons, variants: [], item: lines[0].item }
    // Most of a kind first — "2 plain, 1 + Hot Honey" rather than the reverse.
    : { ...g, addons: [], variants: [...lines].sort((a, b) => b.qty - a.qty) }));
}

// What the kitchen has to make next: slice counts (and the add-ons going on
// them) across every order still waiting to be fired.
//
// Only what's still owed counts. A slice handed over early came off a pie
// that was already out — the reason partial pickups exist — so it needs no
// firing, and leaving it in the tally would have the kitchen make it twice.
const PIZZA_CATEGORY = MENU_DATA[0].category;

export function fireNextCounts(orders) {
  const queued = (orders ?? []).filter((o) => o.status === 'new');
  const pizzas = new Map();
  const addons = new Map();
  for (const o of queued) {
    for (const it of o.items) {
      const owed = it.qty - givenQty(it);
      if (owed === 0) continue;
      // Pizzas get the bright chips; everything else (add-ons, desserts,
      // sides) is dimmed — a dessert-only order must still show up here.
      if (it.category === PIZZA_CATEGORY) pizzas.set(it.name, (pizzas.get(it.name) || 0) + owed);
      else addons.set(it.name, (addons.get(it.name) || 0) + owed);
      // add-ons attached to slices (each applies once per slice in the line)
      for (const a of it.addons ?? []) addons.set(a.name, (addons.get(a.name) || 0) + owed);
    }
  }
  const sorted = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  return {
    pizzas: sorted(pizzas),
    addons: sorted(addons),
    waiting: queued.length,
    oldest: queued.length ? Math.min(...queued.map((o) => o.createdAt)) : null,
  };
}

// One-line summary of an order's items for compact list rows (admin Finished
// list, the past-nights archive) — "2× Cheese Slice, 1× Pepperoni (+ Hot Honey)"
export const formatOrderItems = (items) =>
  items.map((it) => `${it.qty}× ${displayName(it.name)}${it.addons?.length ? ` (+ ${it.addons.map((a) => addonLabel(a.name, it.name)).join(', ')})` : ''}`).join(', ');

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// 'HH:MM' (24h) → '7:30 PM'
export function fmtTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function ageLabel(ts) {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// Spelled-out relative time for the community wall. The kitchen board keeps the
// compact ageLabel above — "12m" scans better down a dense column of live
// orders — but a photo caption reads better as "12 min ago". This also grows a
// days bucket, which the wall needs and the board never does: orders expire in
// 3 days, wall posts live 90, and "1583h 12m" is not a timestamp.
export function agoLabel(ts) {
  // floor, not round: a photo posted 40 seconds ago should still read "just
  // now" rather than jumping to "1 min ago" before a minute has passed.
  const mins = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
