// Pure localStorage/device-identity helpers for the "Post your slice" wall
// (src/pages/SlicesPage.jsx). Kept in their own module — same pattern as
// utils/orders.js and utils/photos.js — so they're testable without pulling
// in React/GSAP/lucide-react just to reach a few plain functions.

const DEVICE_KEY = 'pp_slice_device:v1';
// Ids this device posted. Only decides whether to *offer* the delete button —
// the server independently verifies the device token before removing anything,
// so editing this list gets you nothing.
const MINE_KEY = 'pp_slice_mine:v1';
// One-shot handoff from the order card: arriving straight from a confirmation
// means posting is the whole reason you're here, so the composer opens
// prefilled instead of waiting to be found. It used to carry the pickup code
// (the credential for posting) alongside the name; posting needs no code now,
// so the name is all that's left and the key was renamed to match.
const HANDOFF_KEY = 'pp_slice_who:v1';
const LEGACY_HANDOFF_KEY = 'pp_slice_code:v1';
// The name the poster last used, so a second photo doesn't mean typing it
// again. Distinct from the handoff above: this one persists and only prefills,
// where the handoff fires once and also decides whether the composer starts
// open.
const NAME_KEY = 'pp_slice_name:v1';

export function readMine() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MINE_KEY));
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function writeMine(mine) {
  localStorage.setItem(MINE_KEY, JSON.stringify([...mine]));
}

export function readHandoff() {
  const raw = localStorage.getItem(HANDOFF_KEY);
  if (!raw) return { name: '' };
  try {
    const parsed = JSON.parse(raw);
    return { name: (typeof parsed === 'object' && parsed ? parsed.name : '') ?? '' };
  } catch {
    return { name: '' };
  }
}

export function clearHandoff() {
  localStorage.removeItem(HANDOFF_KEY);
  // A confirmation screen open across the deploy could still have written the
  // old key. Clear it on the same pass so it doesn't sit there forever.
  localStorage.removeItem(LEGACY_HANDOFF_KEY);
}

export const readPosterName = () => localStorage.getItem(NAME_KEY) ?? '';

export function writePosterName(name) {
  // An empty name is a real choice — it's how you post anonymously — so it's
  // stored rather than skipped, or the next visit would helpfully re-attach
  // the name you just removed.
  localStorage.setItem(NAME_KEY, name);
}

export function deviceToken() {
  let token = localStorage.getItem(DEVICE_KEY);
  if (!token) {
    // randomUUID needs a secure context; getRandomValues doesn't, and both
    // beat Math.random for anything that identifies a device.
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(DEVICE_KEY, token);
  }
  return token;
}

// ── Composer form state ──────────────────────────────────────────────
// The form's fields move in groups, not one at a time: picking a photo ends
// the "preparing" spinner *and* clears the last error, submitting clears the
// error *and* disables the button, a success clears the photo and the caption
// together. Separate useState calls let those drift apart — a spinner next to
// a stale error — so the whole lifecycle is one reducer with one action per
// step.
export const EMPTY_FORM = {
  photo: null, caption: '', preparing: false, posting: false, error: '', posted: false,
};

export function formReducer(state, action) {
  switch (action.type) {
    case 'preparing':   return { ...state, preparing: true, error: '' };
    case 'picked':      return { ...state, preparing: false, photo: action.photo };
    case 'pickFailed':  return { ...state, preparing: false, error: 'We could not read that photo — try a different one.' };
    case 'clearPhoto':  return { ...state, photo: null };
    case 'caption':     return { ...state, caption: action.caption };
    case 'submitting':  return { ...state, posting: true, error: '' };
    case 'posted':      return { ...state, posting: false, photo: null, caption: '', posted: true };
    case 'failed':      return { ...state, posting: false, error: action.error };
    case 'postAnother': return { ...state, posted: false };
    default:            return state;
  }
}
