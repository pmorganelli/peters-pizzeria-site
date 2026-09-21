import { BodyTooLargeError, readBody, send, isAdmin } from './_lib/util.js';
import { getSettings, patchSettings, getDoughUsed } from './_lib/store.js';
import { isOpenNow, validateSettings } from './_lib/hours.js';
import { catalog } from './_lib/catalog.js';
import { MAX_DOUGH_BALLS, doughStatus, isDoughType } from '../src/utils/dough.js';

// `dough` is public on purpose. It carries no revenue and no customer data —
// just how many slices are left — and the order page needs it to grey out a
// slice whose pool has run dry, exactly as it already does for the 86 list. A
// dough type the staff haven't counted in is absent from the map rather than
// zero; every consumer reads absent as "not tracking".
const publicView = (settings, doughUsed) => ({
  open: isOpenNow(settings),
  mode: settings.mode,
  hours: settings.hours,
  unavailable: settings.unavailable ?? [],
  dough: doughStatus(settings.dough, doughUsed),
});

// Dough balls counted in at the start of the night. Whole map or nothing: an
// omitted type means "stop tracking that one" (back to unlimited), which is
// also what an explicitly null value means, so the panel can clear a field
// without a second endpoint.
//
// The upper bound is a typo guard rather than a real limit — see
// MAX_DOUGH_BALLS. Rejecting the whole patch on one bad value is deliberate:
// silently dropping the number someone just typed would leave them looking at
// a panel that disagrees with the board.
function validateDough(value) {
  if (value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const dough = {};
  for (const [type, balls] of Object.entries(value)) {
    if (!isDoughType(type)) return null;
    if (balls === null || balls === undefined) continue; // untrack this one
    if (!Number.isInteger(balls) || balls < 0 || balls > MAX_DOUGH_BALLS) return null;
    dough[type] = balls;
  }
  return dough;
}

// The 86 list must only contain real menu item names
function validateUnavailable(value) {
  if (!Array.isArray(value)) return null;
  const menu = catalog();
  if (value.length > menu.size) return null;
  const names = [...new Set(value)];
  return names.every((n) => menu.has(n)) ? names : null;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      // Public: the order page and homepage need open status + sold-out items
      const [settings, used] = await Promise.all([getSettings(), getDoughUsed()]);
      return send(res, 200, publicView(settings, used));
    }
    if (req.method === 'PATCH') {
      if (!isAdmin(req)) return send(res, 401, { error: 'Admin login required' });
      let body;
      try { body = await readBody(req); } catch (err) {
        return send(res, err instanceof BodyTooLargeError ? 413 : 400, { error: err instanceof BodyTooLargeError ? 'Request is too large' : 'Invalid JSON' });
      }

      // Partial update: hours/mode and the 86 list can be patched independently
      const existing = await getSettings();
      const patch = {};
      if (body.mode !== undefined || body.hours !== undefined) {
        const v = validateSettings({ mode: body.mode ?? existing.mode, hours: body.hours ?? existing.hours });
        if (!v) return send(res, 400, { error: 'Invalid store settings' });
        if (body.mode !== undefined) patch.mode = v.mode;
        if (body.hours !== undefined) patch.hours = v.hours;
      }
      if (body.unavailable !== undefined) {
        const v = validateUnavailable(body.unavailable);
        if (v === null) return send(res, 400, { error: 'Invalid availability list' });
        patch.unavailable = v;
      }
      if (body.dough !== undefined) {
        const v = validateDough(body.dough);
        if (v === null) return send(res, 400, { error: `Dough counts must be whole numbers of balls, 0–${MAX_DOUGH_BALLS}.` });
        patch.dough = v;
      }
      if (body.availability !== undefined) {
        const { name, unavailable } = body.availability ?? {};
        if (typeof name !== 'string' || !catalog().has(name) || typeof unavailable !== 'boolean') {
          return send(res, 400, { error: 'Invalid availability change' });
        }
        patch.availability = { name, unavailable };
      }
      if (!Object.keys(patch).length) return send(res, 400, { error: 'No valid settings supplied' });
      const next = await patchSettings(patch);
      // Re-read the counter rather than assuming it's unchanged: setting
      // tonight's dough is the moment staff most want to see what's actually
      // left, and orders may well have landed while the panel was open.
      return send(res, 200, publicView(next, await getDoughUsed()));
    }
    return send(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('store api error:', err);
    return send(res, 500, { error: 'Something went wrong on our end. Please try again.' });
  }
}
