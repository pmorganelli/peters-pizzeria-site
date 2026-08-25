// Recovery for a lazily-imported page chunk that fails to load (see lazyPage in
// App.jsx).
//
// A chunk fails for one reason far more often than any other: a deploy landed
// while this tab was open, so the hashed filename this build asks for is gone
// from the CDN. That 404 matches the SPA rewrite in vercel.json and comes back
// as index.html, so the import rejects on MIME type rather than on a missing
// file. Either way React.lazy caches the rejection and re-throws it on every
// later render, so the route stays broken for the rest of the session — a
// visitor tapping an ordinary nav link gets the crash page with no way back to
// that route. Reloading fetches the current deploy, which is what actually
// fixes it.
//
// The reload is guarded rather than fired on every failure, because a chunk
// that is genuinely broken (bad build, an extension blocking the request) would
// otherwise reload forever. One attempt per session, then the crash page.
const RELOAD_KEY = 'pp_chunk_reload:v1';

// Called on every chunk that does load, so a second deploy later in the same
// session gets its own retry rather than inheriting the first one's spent flag.
export function markChunkLoaded() {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    /* storage blocked — there was nothing recorded to clear either */
  }
}

// True at most once per session: claims the single retry and reports whether
// the caller got it.
export function shouldReloadForChunkFailure() {
  try {
    if (sessionStorage.getItem(RELOAD_KEY) === '1') return false;
    sessionStorage.setItem(RELOAD_KEY, '1');
    return true;
  } catch {
    // No storage to guard with, so a reload here could loop forever. The crash
    // page at least offers a button the visitor chooses to press.
    return false;
  }
}
