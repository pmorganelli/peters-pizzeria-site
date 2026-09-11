import crypto from 'node:crypto';
import { send, isAdmin, readQuery } from './_lib/util.js';
import { listOrders } from './_lib/store.js';
import { acquireNightCloseLock, archiveNightAndClear, listNights, getNight, deleteNight } from './_lib/nights.js';

function makeId(orders) {
  const fingerprint = orders.map((order) => order.id).sort().join('\n');
  return `n${crypto.createHash('sha256').update(fingerprint).digest('hex').slice(0, 16)}`;
}

export default async function handler(req, res) {
  try {
    // Both routes are admin-only — the storefront has no public use for
    // revenue history, and closing the night is a destructive action.
    if (!isAdmin(req)) return send(res, 401, { error: 'Admin login required' });
    if (req.method === 'GET') return await read(req, res);
    if (req.method === 'POST') return await close(req, res);
    if (req.method === 'DELETE') return await remove(req, res);
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
  const token = crypto.randomBytes(16).toString('hex');
  const release = await acquireNightCloseLock(token);
  if (!release) {
    return send(res, 409, { error: 'Another device is already closing the night. Refresh in a moment.' });
  }
  try {
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
      id: makeId(orders),
      closedAt: Date.now(),
      orderCount: orders.length,
      doneCount: done.length,
      cancelledCount: cancelled.length,
      totalCents,
      orders: orders.map(archiveOrder),
    };
    const archived = await archiveNightAndClear(night, orders);
    return send(res, 201, { night: archived });
  } finally {
    // A transient lock-release failure must not replace a successfully
    // committed archive response. The lease still expires on its own.
    await release().catch((err) => console.error('night close lock release error:', err));
  }
}

// DELETE /api/nights?id=… — erase one archived night for good.
//
// The use case this exists for is the trial run: nights closed while testing
// the board before opening, which would otherwise sit in the revenue history
// forever inflating the totals. It's a full delete rather than a "hidden"
// flag because a hidden-but-counted night is exactly the confusion this is
// meant to remove.
//
// No rate limit: unlike slice deletion this is behind the admin cookie with no
// device-token path, so there's nothing to brute-force — a caller who can
// reach it can already close and clear the live board.
async function remove(req, res) {
  const { id } = readQuery(req);
  if (!id) return send(res, 400, { error: 'Invalid id' });

  // Read before delete so a stale archive page (or a second tab that already
  // deleted this night) gets a 404 it can act on, rather than a cheerful 200
  // for a record that was never there.
  const night = await getNight(id);
  if (!night) return send(res, 404, { error: 'That night is no longer in the archive.' });

  await deleteNight(id);
  return send(res, 200, { ok: true });
}
