import crypto from 'node:crypto';
import { BodyTooLargeError, readBody, readQuery, send, isAdmin, clientIp, hasRedisEnv } from './_lib/util.js';
import { catalog, ADDON_CATEGORY, PIZZA_CATEGORY } from './_lib/catalog.js';
import {
  createOrder, getOrder, getOrderByCode, getOrderByIdempotency,
  listOrders, setOrderStatus, getSettings, rateLimit,
} from './_lib/store.js';
import { isOpenNow } from './_lib/hours.js';

// ── Order intake caps ──────────────────────────────────────────────────────
// Intake is admin-only now (see create() below), so these are no longer the
// thing standing between a rush and the kitchen — a valid session is. They
// stay as a runaway backstop: a staff tab stuck in a retry loop, or a leaked
// session, shouldn't be able to fill the board faster than anyone notices.
//
// The numbers are left where the public era put them rather than tightened to
// fit a couple of staff phones, because `clientIp` reads x-forwarded-for and
// campus wifi puts the whole building behind one NAT address — every device
// taking orders shares this budget, and so does every customer sharing that
// wifi who is merely *reading* an order status. Tightening to "how many
// orders can two people type" would start refusing legitimate work the first
// time a third person helps at the window.
//
// (For the record, since the derivation is easy to lose: this was 15 per 10
// minutes, which a load test emptied in seconds — 40 concurrent orders got 15
// through and turned away 25.)
//
// The store also enforces a hard live-board capacity. It refuses a new order
// once that capacity is reached instead of accepting an order that the admin
// board or nightly archive cannot see.
const RATE_WINDOW_S = 600;
const ORDERS_PER_IP = 60;
const ORDERS_GLOBAL = 240;

// ── Lookup caps (`?find=`) ─────────────────────────────────────────────
// This was 30 per IP per 10 minutes, sized for a world where the lookup was a
// fallback: customers ordered on their own phone, kept `pp_order_id`, and only
// typed a code if they'd cleared their browser.
//
// Ordering is staff-only now, which inverts that completely. A customer never
// sees a confirmation screen, so **every one of them** reaches their order
// through this endpoint — and `clientIp` reads x-forwarded-for, so a whole
// building on campus wifi is one address. Forty customers making one or two
// attempts each (a typo, a re-check twenty minutes later) is 40-120 lookups
// from a single IP inside one window. At 30 the thirty-first person of the
// night is told to come back later, and the ones it turns away are the entire
// customer base.
//
// 300 leaves ~2.5x headroom over the worst plausible night from one network,
// and the global cap is the actual abuse backstop. Note that neither of these
// is what stops someone reading a stranger's order: exact-full-name matching
// is (see findOrdersByName). Loosening *that* is the change to think hard
// about; this one only decides whether the feature works on a busy night.
const FIND_PER_IP = 300;
const FIND_GLOBAL = 1200;

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

// POST /api/orders — staff place orders on the customer's behalf (while open)
//
// Ordering used to be open to anyone with the page loaded. It isn't: orders
// are taken at the window and typed in by whoever is running the board, so a
// valid admin session is the credential for creating one. This check sits
// above every other gate on purpose — an unauthenticated request should learn
// nothing here, not whether Redis is wired up, not whether the store is open,
// and not how full the rate-limit window is.
//
// Reading an order stays public and unchanged: `?id=` and `?find=` below are
// how a customer tracks the order someone else typed for them.
async function create(req, res) {
  if (!isAdmin(req)) return send(res, 401, { error: 'Admin login required' });

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

  // Fresh attempts consume the abuse budget; a replay of an already-created
  // order above does not. These sit above the closed-store and sold-out gates
  // on purpose: the store is closed most of the week, so limiting only the
  // requests that get past the gate would leave intake effectively unlimited
  // for the majority of the time — every rejected attempt still costs a body
  // read and a settings GET.
  if (!(await rateLimit(`order:${clientIp(req)}`, ORDERS_PER_IP, RATE_WINDOW_S))) {
    return send(res, 429, { error: 'Too many orders from this network — give it a few minutes.' });
  }
  if (!(await rateLimit('order:all', ORDERS_GLOBAL, RATE_WINDOW_S))) {
    return send(res, 429, { error: 'We are getting slammed! Please try again in a couple minutes.' });
  }

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

// ── Public lookup: pickup code, then name ─────────────────────────────
// Name lookup was removed once, and it is deliberately back. The original
// reasoning still holds on its own terms — a pickup code is a credential and a
// name is public information, so anyone can search a common name and turn up
// somebody else's order — but the situation around it changed twice. Posting
// to the community wall no longer takes a pickup code, so the code is not the
// credential for anything but collecting a pizza; and ordering went
// staff-only, so a customer never sees their own confirmation screen and the
// name they gave at the window is frequently the only thing they have.
//
// What that leaves is: someone who knows a real customer's exact name, on a
// night that customer has a live order, can find it and see its pickup code.
// The bound on that is the 30-per-IP-per-10-minutes limiter above, the fact
// that only exact full names match (no prefixes, no partials), and orders
// living three days. It is a real trade, made knowingly — see CLAUDE.md.
//
// A code always wins when the query is shaped like one, so the credential path
// is never shadowed by a namesake. The one collision this can't resolve is a
// customer whose name happens to be four characters that are all in
// CODE_ALPHABET *and* matches a live pickup code — they'd get that order
// instead of their own. Four simultaneous coincidences; the picker below
// covers everything else.
const MAX_NAME_MATCHES = 8;

const normalizeName = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

async function findOrder(query) {
  const code = query.replace(/^#/, '').trim().toUpperCase();
  if (code.length !== 4 || [...code].some((ch) => !CODE_ALPHABET.includes(ch))) return null;
  return getOrderByCode(code);
}

// Exact, case- and whitespace-insensitive. Never a prefix: "sar" matching
// Sarah is the behaviour that made the old version a name-harvesting tool
// rather than a lookup.
//
// Costs one full board read (bounded by MAX_LIVE_ORDERS) per miss on the code
// path, which is why it sits behind the same limiter and below the indexed
// code lookup rather than beside it.
async function findOrdersByName(query) {
  const wanted = normalizeName(query);
  if (wanted.length < 2) return [];
  return (await listOrders()).filter((o) => normalizeName(o.name) === wanted);
}

// Just enough to tell your own order from a namesake's: what's in it, when it
// was placed, where it's up to. Deliberately no pickup code — picking one is
// what gets you that, and it keeps a single search from printing every
// matching customer's collection credential in one response.
const matchSummary = ({ id, status, createdAt, items, totalCents }) =>
  ({ id, status, createdAt, items, totalCents });

// GET /api/orders?id=…   — public status of a single order (customer polling)
// GET /api/orders?find=… — public lookup by exact pickup code, falling back to
//                          an exact name match (rate-limited). Several orders
//                          under one name come back as `matches` for the
//                          customer to pick from rather than a guess.
// GET /api/orders        — full board (admin only)
async function read(req, res) {
  const { id, find } = readQuery(req);
  if (id) {
    const order = await getOrder(id);
    if (!order) return send(res, 404, { error: 'Order not found (orders expire after a few days).' });
    return send(res, 200, { order: publicOrder(order) });
  }
  if (find !== undefined) {
    if (!(await rateLimit(`find:${clientIp(req)}`, FIND_PER_IP, RATE_WINDOW_S))) {
      return send(res, 429, { error: 'Too many lookups — give it a minute and try again.' });
    }
    if (!(await rateLimit('find:all', FIND_GLOBAL, RATE_WINDOW_S))) {
      return send(res, 429, { error: 'We are getting slammed! Please try again in a couple minutes.' });
    }
    const query = String(find);
    const byCode = await findOrder(query);
    if (byCode) return send(res, 200, { order: publicOrder(byCode) });

    const byName = await findOrdersByName(query);
    // One match is unambiguous, so skip the picker and hand it straight over.
    if (byName.length === 1) return send(res, 200, { order: publicOrder(byName[0]) });
    if (byName.length > 1) {
      return send(res, 200, { matches: byName.slice(0, MAX_NAME_MATCHES).map(matchSummary) });
    }
    return send(res, 404, { error: 'No order under that pickup code or name — double-check it, or it may have expired.' });
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
