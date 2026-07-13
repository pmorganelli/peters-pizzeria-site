import crypto from 'node:crypto';
import { readBody, readQuery, send, isAdmin, clientIp, hasRedisEnv } from './_lib/util.js';
import { catalog, ADDON_CATEGORY, PIZZA_CATEGORY } from './_lib/catalog.js';
import { createOrder, getOrder, listOrders, updateOrder, getSettings, rateLimit } from './_lib/store.js';
import { isOpenNow } from './_lib/hours.js';

const STATUSES = ['new', 'firing', 'ready', 'done', 'cancelled'];
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L

function makeId() {
  // 10 random bytes → unguessable; the id doubles as the customer's
  // read-token for order status, so it must not be enumerable.
  return `o${crypto.randomBytes(10).toString('hex')}`;
}

function makeCode() {
  return Array.from(crypto.randomBytes(4), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function validateItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 40) return null;
  const menu = catalog();
  const items = [];
  for (const raw of rawItems) {
    const entry = menu.get(raw?.name);
    const qty = Number(raw?.qty);
    if (!entry || !Number.isInteger(qty) || qty < 1 || qty > 30) return null;
    const item = { name: entry.name, category: entry.category, priceCents: entry.priceCents, qty };
    // Optional per-line add-ons: only on slices, only real add-on items, no dupes
    if (raw.addons !== undefined) {
      if (!Array.isArray(raw.addons) || raw.addons.length > 8) return null;
      if (raw.addons.length > 0) {
        if (entry.category !== PIZZA_CATEGORY) return null;
        const addons = [];
        for (const name of new Set(raw.addons)) {
          const addon = menu.get(name);
          if (!addon || addon.category !== ADDON_CATEGORY) return null;
          addons.push({ name: addon.name, priceCents: addon.priceCents });
        }
        item.addons = addons;
      }
    }
    items.push(item);
  }
  return items;
}

const lineTotal = (it) =>
  (it.priceCents + (it.addons ?? []).reduce((sum, a) => sum + a.priceCents, 0)) * it.qty;

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') return await create(req, res);
    if (req.method === 'GET') return await read(req, res);
    if (req.method === 'PATCH') return await patch(req, res);
    return send(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('orders api error:', err);
    return send(res, 500, { error: 'Something went wrong on our end. Please try again.' });
  }
}

// POST /api/orders — anyone can place an order (while the store is open)
async function create(req, res) {
  // Deployed without Redis, orders would silently land in per-instance memory
  // and vanish between cold starts. Refuse loudly instead of losing orders.
  if (process.env.VERCEL && !hasRedisEnv()) {
    return send(res, 503, { error: 'Ordering is temporarily offline — find us at the window!' });
  }

  const settings = await getSettings();
  if (!isOpenNow(settings)) {
    return send(res, 403, { error: 'We are not taking orders right now — check back when we open!', closed: true });
  }

  // Spam guards: cap per-IP and globally per window. The per-IP cap is
  // generous because campus wifi puts whole dorms behind one NAT address.
  if (!(await rateLimit(`order:${clientIp(req)}`, 15, 600))) {
    return send(res, 429, { error: 'Too many orders from this network — give it a few minutes.' });
  }
  if (!(await rateLimit('order:all', 120, 600))) {
    return send(res, 429, { error: 'We are getting slammed! Please try again in a couple minutes.' });
  }

  let body;
  try { body = await readBody(req); } catch { return send(res, 400, { error: 'Invalid JSON' }); }

  const name = clean(body.name, 60);
  const contact = clean(body.contact, 80);
  const notes = clean(body.notes, 280);
  if (name.length < 2) return send(res, 400, { error: 'Please tell us your name so we can find you at pickup.' });

  const items = validateItems(body.items);
  if (!items) return send(res, 400, { error: 'Your cart has an item we did not recognize — please refresh and try again.' });

  const eightySixed = new Set(settings.unavailable ?? []);
  const soldOut = items.find((it) => eightySixed.has(it.name))
    ?? items.flatMap((it) => it.addons ?? []).find((a) => eightySixed.has(a.name));
  if (soldOut) {
    return send(res, 400, { error: `${soldOut.name} just sold out — please remove it from your cart.`, soldOut: soldOut.name });
  }

  const totalCents = items.reduce((sum, it) => sum + lineTotal(it), 0);
  const now = Date.now();
  const order = {
    id: makeId(),
    code: makeCode(),
    name,
    contact,
    notes,
    items,
    totalCents,
    status: 'new',
    createdAt: now,
    updatedAt: now,
  };
  await createOrder(order);
  return send(res, 201, { order });
}

// Public responses never include contact/notes — the status UI doesn't show
// them, and the `find` lookup means typing a name can reach someone else's order.
const publicOrder = ({ contact, notes, ...rest }) => rest;

const ACTIVE = new Set(['new', 'firing', 'ready']);

// Match a pickup code (exact) or a name (full, first, or prefix) against the
// recent orders; prefer the newest still-active order when names collide.
async function findOrder(query) {
  const q = query.replace(/^#/, '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (q.length < 2) return null;
  const orders = await listOrders(); // newest first, bounded by the 3-day TTL
  const byCode = orders.find((o) => o.code.toLowerCase() === q);
  if (byCode) return byCode;
  const byName = orders.filter((o) => {
    const n = o.name.toLowerCase();
    return n === q || n.split(' ')[0] === q || n.startsWith(q);
  });
  return byName.find((o) => ACTIVE.has(o.status)) ?? byName[0] ?? null;
}

// GET /api/orders?id=…   — public status of a single order (customer polling)
// GET /api/orders?find=… — public lookup by pickup code or name (rate-limited)
// GET /api/orders        — full board (admin only)
async function read(req, res) {
  const { id, find } = readQuery(req);
  if (id) {
    const order = await getOrder(id);
    if (!order) return send(res, 404, { error: 'Order not found (orders expire after a few days).' });
    return send(res, 200, { order: publicOrder(order) });
  }
  if (find !== undefined) {
    if (!(await rateLimit(`find:${clientIp(req)}`, 30, 600))) {
      return send(res, 429, { error: 'Too many lookups — give it a minute and try again.' });
    }
    const order = await findOrder(String(find));
    if (!order) return send(res, 404, { error: 'No order under that code or name — double-check the spelling, or it may have expired.' });
    return send(res, 200, { order: publicOrder(order) });
  }
  if (!isAdmin(req)) return send(res, 401, { error: 'Admin login required' });
  return send(res, 200, { orders: await listOrders() });
}

// PATCH /api/orders?id=… {status} — admin advances/cancels an order
async function patch(req, res) {
  if (!isAdmin(req)) return send(res, 401, { error: 'Admin login required' });
  const { id } = readQuery(req);
  let body;
  try { body = await readBody(req); } catch { return send(res, 400, { error: 'Invalid JSON' }); }
  if (!id || !STATUSES.includes(body.status)) return send(res, 400, { error: 'Invalid id or status' });
  // Terminal states are final — a stale admin tab must not resurrect a
  // cancelled order or un-complete a picked-up one.
  const existing = await getOrder(id);
  if (!existing) return send(res, 404, { error: 'Order not found' });
  if ((existing.status === 'cancelled' || existing.status === 'done') && existing.status !== body.status) {
    return send(res, 409, { error: `Order is already ${existing.status} — refresh the board.` });
  }
  const order = await updateOrder(id, { status: body.status });
  if (!order) return send(res, 404, { error: 'Order not found' });
  return send(res, 200, { order });
}
