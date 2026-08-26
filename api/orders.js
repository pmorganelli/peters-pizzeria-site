import crypto from 'node:crypto';
import { BodyTooLargeError, readBody, readQuery, send, isAdmin, clientIp, hasRedisEnv } from './_lib/util.js';
import { catalog, ADDON_CATEGORY, PIZZA_CATEGORY } from './_lib/catalog.js';
import {
  createOrder, getOrder, getOrderByCode, getOrderByIdempotency,
  listOrders, setOrderStatus, getSettings, rateLimit,
} from './_lib/store.js';
import { isOpenNow } from './_lib/hours.js';

// ── Order intake caps ──────────────────────────────────────────────────────
// `clientIp` reads x-forwarded-for, so the per-IP cap is really a *per-network*
// cap: campus wifi puts an entire dorm behind one NAT address, and every
// student in that building shares this budget.
//
// It was 15 per 10 minutes, which a load test emptied in seconds — 40
// concurrent orders got 15 through and turned away 25. On a Saturday rush
// that's the whole building locked out after the fifteenth pizza, and the
// people it turns away are exactly the customers, not an attacker.
//
// 60 per 10 minutes is one order every ten seconds from a single building,
// which is faster than a student-run kitchen can physically fire them. The
// global cap stays the real abuse backstop and keeps ~4x headroom over the
// largest plausible rush. Both are here to be tuned rather than hunted for.
//
// The store also enforces a hard live-board capacity. It refuses a new order
// once that capacity is reached instead of accepting an order that the admin
// board or nightly archive cannot see.
const RATE_WINDOW_S = 600;
const ORDERS_PER_IP = 60;
const ORDERS_GLOBAL = 240;

const STATUSES = ['new', 'firing', 'ready', 'done', 'cancelled'];
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,128}$/;

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
  const seen = new Set();
  for (const raw of rawItems) {
    const entry = menu.get(raw?.name);
    const qty = Number(raw?.qty);
    if (!entry || !Number.isInteger(qty) || qty < 1 || qty > entry.maxQty) return null;
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
    // One line per name+addon set — the client's grouping guarantees this,
    // and the admin/status UIs key list rows on it.
    const lineKey = `${item.name}::${(item.addons ?? []).map((a) => a.name).sort().join(',')}`;
    if (seen.has(lineKey)) return null;
    seen.add(lineKey);
    items.push(item);
  }
  // maxQty is a per-item cap, not a per-line one — splitting the same item
  // across several add-on combinations (each individually under the cap)
  // must not let the total exceed it. The client's cart model can't produce
  // this (the stepper counts every unit of an item regardless of its add-ons),
  // but a hand-built request could.
  const totalByName = new Map();
  for (const it of items) totalByName.set(it.name, (totalByName.get(it.name) ?? 0) + it.qty);
  for (const [name, total] of totalByName) {
    if (total > menu.get(name).maxQty) return null;
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

  let body;
  try { body = await readBody(req); } catch (err) {
    return send(res, err instanceof BodyTooLargeError ? 413 : 400, {
      error: err instanceof BodyTooLargeError ? 'That order is too large.' : 'Invalid JSON',
    });
  }

  const name = clean(body.name, 60);
  const notes = clean(body.notes, 280);
  if (name.length < 2) return send(res, 400, { error: 'Please tell us your name so we can find you at pickup.' });

  const items = validateItems(body.items);
  if (!items) return send(res, 400, { error: 'Your cart has an item we did not recognize — please refresh and try again.' });

  const totalCents = items.reduce((sum, it) => sum + lineTotal(it), 0);

  const idempotencyKey = String(req.headers['idempotency-key'] ?? '');
  if (idempotencyKey && !IDEMPOTENCY_KEY.test(idempotencyKey)) {
    return send(res, 400, { error: 'Invalid order retry key — refresh and try again.' });
  }
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ name, notes, items, totalCents })).digest('hex');

  // A retry must return the first result even if the store closed or a rate
  // window filled after that result was committed. Replaying before those
  // gates is what makes an ambiguous network failure safe.
  const replay = await getOrderByIdempotency(idempotencyKey, fingerprint);
  if (replay.conflict) return send(res, 409, { error: 'This retry key was already used for a different order.' });
  if (replay.order) return send(res, 200, { order: replay.order, replayed: true });

  const settings = await getSettings();
  if (!isOpenNow(settings)) {
    return send(res, 403, { error: 'We are not taking orders right now — check back when we open!', closed: true });
  }
  const eightySixed = new Set(settings.unavailable ?? []);
  const soldOut = items.find((it) => eightySixed.has(it.name))
    ?? items.flatMap((it) => it.addons ?? []).find((a) => eightySixed.has(a.name));
  if (soldOut) {
    return send(res, 400, { error: `${soldOut.name} just sold out — please remove it from your cart.`, soldOut: soldOut.name });
  }

  // Fresh attempts consume the abuse budget; a replay of an already-created
  // order above does not.
  if (!(await rateLimit(`order:${clientIp(req)}`, ORDERS_PER_IP, RATE_WINDOW_S))) {
    return send(res, 429, { error: 'Too many orders from this network — give it a few minutes.' });
  }
  if (!(await rateLimit('order:all', ORDERS_GLOBAL, RATE_WINDOW_S))) {
    return send(res, 429, { error: 'We are getting slammed! Please try again in a couple minutes.' });
  }

  // The store owns both uniqueness checks. A pre-read here would race another
  // serverless invocation between choosing a code and writing the order.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const now = Date.now();
    const order = {
      id: makeId(),
      code: makeCode(),
      name,
      notes,
      items,
      totalCents,
      status: 'new',
      createdAt: now,
      updatedAt: now,
    };
    const stored = await createOrder(order, { idempotencyKey: idempotencyKey || null, fingerprint });
    if (stored.reason === 'code_conflict') continue;
    if (stored.reason === 'capacity') {
      return send(res, 503, { error: 'The order board is full right now — please order at the window.' });
    }
    if (stored.reason === 'idempotency_conflict') {
      return send(res, 409, { error: 'This retry key was already used for a different order.' });
    }
    return send(res, stored.created ? 201 : 200, { order: stored.order, replayed: !stored.created });
  }
  return send(res, 503, { error: 'Could not reserve a pickup code — please try again.' });
}

// Public responses never include contact/notes — the status UI doesn't show
// them, and order ids/codes are the credentials for public reads.
// `contact` is no longer collected or stored (no UI has asked for it in a long
// time), but it stays in this destructure deliberately: orders written before
// the field was dropped can still be live in Redis for up to 3 days, and this
// is the only thing standing between one of those and a public response.
const publicOrder = ({ contact, notes, ...rest }) => rest;

// A pickup code is a credential, while a name is public information. Name or
// prefix lookup used to return the same response (including the posting code),
// which let anyone search common names and act as that customer.
async function findOrder(query) {
  const code = query.replace(/^#/, '').trim().toUpperCase();
  if (code.length !== 4 || [...code].some((ch) => !CODE_ALPHABET.includes(ch))) return null;
  return getOrderByCode(code);
}

// GET /api/orders?id=…   — public status of a single order (customer polling)
// GET /api/orders?find=… — public lookup by exact pickup code (rate-limited)
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
    if (!order) return send(res, 404, { error: 'No order under that pickup code — double-check it, or it may have expired.' });
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
  try { body = await readBody(req); } catch (err) {
    return send(res, err instanceof BodyTooLargeError ? 413 : 400, { error: err instanceof BodyTooLargeError ? 'Invalid request.' : 'Invalid JSON' });
  }
  if (!id || !STATUSES.includes(body.status)) return send(res, 400, { error: 'Invalid id or status' });
  // Terminal states are final — a stale admin tab must not resurrect a
  // cancelled order or un-complete a picked-up one. The check-and-write is
  // atomic in the store so two racing tabs can't slip past it.
  const { order, conflict } = await setOrderStatus(id, body.status);
  if (conflict) return send(res, 409, { error: `Order is already ${conflict} — refresh the board.` });
  if (!order) return send(res, 404, { error: 'Order not found' });
  return send(res, 200, { order });
}
