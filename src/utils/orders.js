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
