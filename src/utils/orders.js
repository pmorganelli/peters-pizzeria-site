// Shared between the client pages and the api/ functions (the API imports
// parsePriceCents so prices are computed from one implementation).

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


// One order line's total: (slice + its add-ons) × qty. Add-ons are nested
// on the line ({ name, priceCents }) — legacy orders have none.
export const itemTotalCents = (it) =>
  (it.priceCents + (it.addons ?? []).reduce((sum, a) => sum + a.priceCents, 0)) * it.qty;

// A stable React key for one order line. Cart-building already merges any
// units sharing both name and add-ons into a single line, so name+addons
// uniquely identifies a line within an order — no index needed.
export const orderLineKey = (it) =>
  `${it.name}::${(it.addons ?? []).map((a) => a.name).join(',')}`;

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
