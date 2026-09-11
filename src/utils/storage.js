// localStorage that can't take the page down with it.
//
// Every access below is wrapped, because `localStorage` is not merely
// *unreliable* in some browsers — it *throws*. Safari with "Block All Cookies"
// on raises a SecurityError from the property getter itself, before any method
// is called; a full quota (or Safari private browsing on older versions)
// raises QuotaExceededError from setItem. Both are ordinary configurations a
// customer can be sitting on at the window, not exotic ones.
//
// What that used to cost: the app touches storage during mount (App clears a
// legacy key, the wall persists the ids it posted, the order page persists the
// cart), so a throw there escapes an effect and lands in the ErrorBoundary —
// a crash page instead of a pizza menu, for a browser setting. And since the
// community wall began *requiring* a device token, a browser that can't keep
// one couldn't post at all.
//
// The trade is explicit: on such a browser nothing persists across a reload.
// A cart won't survive, a photo won't be self-deletable later. Everything
// still works within the session, which is the whole visit.

let warned = false;

// Reading `globalThis.localStorage` is itself the throwing operation in the
// blocked-cookies case, so even the availability probe needs the try.
function store() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// Holds *only* values whose write actually failed — an unreachable store, or a
// refused setItem. That restriction matters: an entry per successful write
// would shadow the real store, so a key cleared by anything other than
// removeStored() (another tab, the browser tidying up, a test's
// localStorage.clear()) would keep reading back the stale in-memory copy
// forever. Keeping it to failures means it is empty on every browser that
// works, and consulted only where there is nothing else to consult.
const fallback = new Map();

function unavailable() {
  if (!warned) {
    warned = true;
    // Deliberately the only console call: knowing *why* a returning visitor
    // looks like a new one is worth one line, and repeating it per key isn't.
    console.warn('Local storage is unavailable — this session will not be remembered.');
  }
}

export function readStored(key) {
  const s = store();
  if (!s) { unavailable(); return fallback.get(key) ?? null; }
  try {
    // The in-memory copy backstops a *readable but unwritable* store — a full
    // quota, or a private window that allows getItem and refuses setItem.
    // Without this, a value written this session reads back as absent and the
    // session behaves as if nothing it did ever happened, which is worse than
    // a store that fails outright. removeStored() drops the fallback entry
    // too, so a deleted key can't come back this way.
    return s.getItem(key) ?? fallback.get(key) ?? null;
  } catch {
    unavailable();
    return fallback.get(key) ?? null;
  }
}

export function writeStored(key, value) {
  const s = store();
  if (!s) { unavailable(); fallback.set(key, value); return; }
  try {
    s.setItem(key, value);
    // A write that lands supersedes any earlier one that didn't, so the
    // fallback never gets to answer for a key the real store now holds.
    fallback.delete(key);
  } catch {
    // Quota, or a private window that allows reads but refuses writes.
    unavailable();
    fallback.set(key, value);
  }
}

export function removeStored(key) {
  fallback.delete(key);
  const s = store();
  if (!s) return;
  try {
    s.removeItem(key);
  } catch { /* nothing to clean up if it was never written */ }
}

// JSON convenience over the same guards. A malformed value reads as `fallback`
// rather than throwing — a half-written cart shouldn't be fatal either.
export function readStoredJSON(key, fallbackValue = null) {
  const raw = readStored(key);
  if (raw === null) return fallbackValue;
  try {
    return JSON.parse(raw) ?? fallbackValue;
  } catch {
    return fallbackValue;
  }
}

export const writeStoredJSON = (key, value) => writeStored(key, JSON.stringify(value));
