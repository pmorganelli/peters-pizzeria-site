import crypto from 'node:crypto';
import { send, isAdmin } from './_lib/util.js';
import { listOrders, clearOrders } from './_lib/store.js';
import { createNight, listNights } from './_lib/nights.js';

function makeId() {
  return `n${crypto.randomBytes(8).toString('hex')}`;
}

export default async function handler(req, res) {
  try {
    // Both routes are admin-only — the storefront has no public use for
    // revenue history, and closing the night is a destructive action.
    if (!isAdmin(req)) return send(res, 401, { error: 'Admin login required' });
    if (req.method === 'GET') return await read(req, res);
    if (req.method === 'POST') return await close(req, res);
    return send(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('nights api error:', err);
    return send(res, 500, { error: 'Something went wrong on our end. Please try again.' });
  }
}

// GET /api/nights — past-night archives, newest first
async function read(req, res) {
  const nights = await listNights();
  return send(res, 200, { nights });
}

// Orders are gone the moment this closes (clearOrders() below), so this
// per-order snapshot is the only place "who ordered, what they ordered, how
// much" survives past tonight. contact/notes are dropped, same PII rule
// orders.js's publicOrder() already follows for anything that outlives the
// order itself.
const archiveOrder = ({ id, code, name, items, totalCents, status }) => ({ id, code, name, items, totalCents, status });

// POST /api/nights — "close for the night": snapshot the live board into a
// permanent archive, then wipe it so the next Saturday starts clean. Revenue
// only counts orders actually picked up — a cancelled order was never paid
// for, so it's tallied separately rather than folded into the total.
async function close(req, res) {
  const orders = await listOrders();
  // Refuse an empty board rather than writing a spurious zero-count record
  // into the permanent archive. Reachable in practice when two admin tabs
  // race: the second tab's stale poll still shows orders, its confirm dialog
  // quotes them, but by the time its POST lands the first tab has already
  // archived and cleared everything. 409 (not 400) so the client can tell
  // "state moved under you" apart from a malformed request.
  if (orders.length === 0) {
    return send(res, 409, { error: 'Nothing to archive — the board is already empty. Another device may have closed the night.' });
  }
  const done = orders.filter((o) => o.status === 'done');
  const cancelled = orders.filter((o) => o.status === 'cancelled');
  const totalCents = done.reduce((sum, o) => sum + o.totalCents, 0);

  const night = {
    id: makeId(),
    closedAt: Date.now(),
    orderCount: orders.length,
    doneCount: done.length,
    cancelledCount: cancelled.length,
    totalCents,
    orders: orders.map(archiveOrder),
  };
  await createNight(night);
  // Pass the exact ids just archived, not "everything currently live" — an
  // order placed between the listOrders() snapshot above and this call would
  // otherwise be deleted without ever being archived. See clearOrders().
  await clearOrders(orders.map((o) => o.id));
  return send(res, 201, { night });
}
