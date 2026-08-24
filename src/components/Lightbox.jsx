import { useEffect, useEffectEvent, useRef } from 'react';
import { X, ArrowLeft, ArrowRight } from 'lucide-react';
import { photoSrc, photoSrcSet, LIGHTBOX_QUALITY } from '../utils/photos';

// The candidate list and the `sizes` hint are shared by the rendered <img> and
// the neighbour prefetch below, because the two MUST resolve to the same URL.
// They didn't: the prefetch hardcoded the 1280 candidate while `sizes` sends a
// DPR-2 iPad to 1600 and a laptop to 2048, so every arrow press threw away the
// warmed image and started a fresh download. Change these together or not at all.
const LB_WIDTHS = [960, 1280, 1600, 2048];
const LB_SIZES = '(max-width: 768px) 96vw, 88vw';
// Only ever used where srcSet is unavailable (localhost has no optimizer).
const LB_FALLBACK_WIDTH = 1280;

// `captions` is optional and parallel to `photos` — the community wall passes
// one, the gallery doesn't. Each entry is { name, caption, age } or null.
export function Lightbox({ photos, index, onClose, onPrev, onNext, captions }) {
  const touchX = useRef(null);
  const dialogRef = useRef(null);
  // A photo with neither a name nor a caption gets no bar at all, rather than
  // an empty strip across the bottom of the image.
  const entry = captions?.[index];
  const caption = entry && (entry.name || entry.caption) ? entry : null;

  // Native <dialog> gives us the focus trap and backdrop for free, but it has
  // to be opened imperatively via showModal() — there's no declarative "open as
  // modal" prop. The close() cleanup pairs with it: without one, StrictMode's
  // dev remount calls showModal() on an already-open dialog and throws.
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  // onPrev/onNext arrive as fresh closures on every render of the parent, so
  // listing them as deps tore the keydown listener down and rebuilt it on each
  // one. useEffectEvent (stable in React 19.2) reads the latest callback at
  // call time without participating in the dependency list, so the listener is
  // attached once for the life of the lightbox.
  const onKey = useEffectEvent((e) => {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); onPrev(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); onNext(); }
  });

  useEffect(() => {
    const handler = (e) => onKey(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Lock the page behind the overlay while the lightbox is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Warm the browser cache with the neighbors so arrow/swipe feels instant.
  // srcset/sizes are set (and set *before* src, which is what triggers
  // selection) so the prefetch resolves to the exact candidate the <img> below
  // will ask for. decode() then takes the JPEG/AVIF decode off the interaction
  // too — on a tablet that's the difference between a swap and a visible stall.
  // Deliberately no abort on cleanup: a half-downloaded neighbour is progress
  // worth keeping when someone arrows quickly through the set.
  useEffect(() => {
    if (photos.length < 2) return;
    [1, -1].forEach((d) => {
      const src = photos[(index + d + photos.length) % photos.length];
      const im = new Image();
      im.sizes = LB_SIZES;
      const set = photoSrcSet(src, LB_WIDTHS, LIGHTBOX_QUALITY);
      if (set) im.srcset = set;
      im.src = photoSrc(src, LB_FALLBACK_WIDTH, LIGHTBOX_QUALITY);
      im.decode?.().catch(() => {});
    });
  }, [index, photos]);

  return (
    <dialog
      ref={dialogRef}
      className={`lb-overlay${caption ? ' lb-has-caption' : ''}`}
      aria-label="Photo lightbox"
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => {
        // A touch list can come back empty (cancelled or multi-touch gestures),
        // and reading .clientX off nothing throws mid-swipe.
        const endX = e.changedTouches[0]?.clientX;
        const startX = touchX.current;
        touchX.current = null;
        if (startX === null || endX === undefined) return;
        const dx = endX - startX;
        if (dx > 50) onPrev();
        else if (dx < -50) onNext();
      }}
    >
      {/* Click-anywhere-to-dismiss is a real button covering the dialog rather
          than an onClick on the <dialog> itself: a handler there is invisible
          to keyboard and screen-reader users, who can't "click the backdrop".
          It sits behind every other child (first in source order, and they're
          either absolutely positioned or painted later), so tapping the photo,
          the caption or the arrows lands on those, not on this — which is why
          none of them need stopPropagation any more.
          Not focusable and hidden from assistive tech on purpose: it would
          otherwise be a second, viewport-sized "Close lightbox" control
          duplicating the visible one below. Escape (onCancel) and that button
          are the accessible ways out. */}
      <button
        type="button"
        className="lb-backdrop"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
      />
      <button type="button" className="lb-close" aria-label="Close lightbox" onClick={onClose}><X size={13} /> close</button>
      {/* This used to offer the untouched camera original as a 3-4 MB candidate.
          Now every candidate is a transform of photos/large/, served as AVIF
          where the browser takes it, at a slightly higher quality than the rest
          of the site because this is the one image someone is actually studying.
          No `key` here on purpose. Keying on the photo tore the <img> down and
          built a new one on every step, so each navigation started from an
          element with nothing decoded — a blank frame even when the bytes were
          already cached, plus the entrance animation replaying on every arrow
          press instead of once when the lightbox opens. Reusing the element
          lets a prefetched neighbour swap in immediately, and keeps the
          outgoing photo on screen (rather than blank) if it isn't ready yet. */}
      <img
        className="lb-img"
        src={photoSrc(photos[index], LB_FALLBACK_WIDTH, LIGHTBOX_QUALITY)}
        srcSet={photoSrcSet(photos[index], LB_WIDTHS, LIGHTBOX_QUALITY)}
        sizes={LB_SIZES}
        /* camelCase since the React 19 upgrade — 18 dropped this spelling with
           a warning, which is why it used to be written `fetchpriority`. */
        fetchPriority="high"
        decoding="sync"
        alt="Enlarged view"
      />
      {caption && (
        <div className="lb-caption">
          {caption.name && <span className="lb-caption-name">{caption.name}</span>}
          {caption.caption && <span className="lb-caption-text">{caption.caption}</span>}
          {caption.age && <span className="lb-caption-age">{caption.age}</span>}
        </div>
      )}
      {photos.length > 1 && (
        <>
          <button type="button" className="lb-arrow lb-prev" aria-label="Previous photo" onClick={onPrev}><ArrowLeft size={20} strokeWidth={1.5} /></button>
          <button type="button" className="lb-arrow lb-next" aria-label="Next photo" onClick={onNext}><ArrowRight size={20} strokeWidth={1.5} /></button>
          <div className="lb-counter">{index + 1} / {photos.length}</div>
        </>
      )}
    </dialog>
  );
}
