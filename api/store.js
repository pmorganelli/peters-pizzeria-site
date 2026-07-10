import { readBody, send, isAdmin } from './_lib/util.js';
import { getSettings, saveSettings } from './_lib/store.js';
import { isOpenNow, validateSettings } from './_lib/hours.js';
import { catalog } from './_lib/catalog.js';

const publicView = (settings) => ({
  open: isOpenNow(settings),
  mode: settings.mode,
  hours: settings.hours,
  unavailable: settings.unavailable ?? [],
});

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
      return send(res, 200, publicView(await getSettings()));
    }
    if (req.method === 'PATCH') {
      if (!isAdmin(req)) return send(res, 401, { error: 'Admin login required' });
      let body;
      try { body = await readBody(req); } catch { return send(res, 400, { error: 'Invalid JSON' }); }

      // Partial update: hours/mode and the 86 list can be patched independently
      const existing = await getSettings();
      const next = { ...existing };
      if (body.mode !== undefined || body.hours !== undefined) {
        const v = validateSettings({ mode: body.mode ?? existing.mode, hours: body.hours ?? existing.hours });
        if (!v) return send(res, 400, { error: 'Invalid store settings' });
        next.mode = v.mode;
        next.hours = v.hours;
      }
      if (body.unavailable !== undefined) {
        const v = validateUnavailable(body.unavailable);
        if (v === null) return send(res, 400, { error: 'Invalid availability list' });
        next.unavailable = v;
      }
      await saveSettings(next);
      return send(res, 200, publicView(next));
    }
    return send(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('store api error:', err);
    return send(res, 500, { error: 'Something went wrong on our end. Please try again.' });
  }
}
