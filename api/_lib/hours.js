// Store open/closed logic. Settings shape:
//   { mode: 'open' | 'closed' | 'auto',
//     hours: { day: 0-6 (0=Sunday), start: 'HH:MM', end: 'HH:MM', tz: IANA zone } }
// 'open'/'closed' are manual overrides; 'auto' follows the weekly window.

export const DEFAULT_SETTINGS = {
  mode: 'auto',
  hours: { day: 6, start: '19:00', end: '20:30', tz: 'America/New_York' },
  unavailable: [], // 86 list: menu item names that are sold out / off today
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMins = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

// Cached per timezone: Intl.DateTimeFormat construction loads locale-data
// tables and is too slow to redo on every isOpenNow() call.
const dayPartsFormatters = new Map();
function dayPartsFormatter(tz) {
  let fmt = dayPartsFormatters.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    dayPartsFormatters.set(tz, fmt);
  }
  return fmt;
}

export function validateSettings(body) {
  const mode = body?.mode;
  if (!['open', 'closed', 'auto'].includes(mode)) return null;
  const h = body.hours ?? DEFAULT_SETTINGS.hours;
  const day = Number(h.day);
  if (!Number.isInteger(day) || day < 0 || day > 6) return null;
  if (!HHMM.test(h.start) || !HHMM.test(h.end)) return null;
  if (toMins(h.start) >= toMins(h.end)) return null;
  let tz = typeof h.tz === 'string' ? h.tz : DEFAULT_SETTINGS.hours.tz;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { tz = DEFAULT_SETTINGS.hours.tz; }
  return { mode, hours: { day, start: h.start, end: h.end, tz } };
}

export function isOpenNow(settings, now = new Date()) {
  if (settings.mode === 'open') return true;
  if (settings.mode === 'closed') return false;
  const { day, start, end, tz } = settings.hours;
  const parts = dayPartsFormatter(tz).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const dayIdx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  const mins = Number(get('hour')) * 60 + Number(get('minute'));
  return dayIdx === day && mins >= toMins(start) && mins < toMins(end);
}
