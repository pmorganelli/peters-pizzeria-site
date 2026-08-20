import { useEffect, useRef } from 'react';
import { X, ArrowLeft, ArrowRight } from 'lucide-react';
import { photoSrc, photoSrcSet, LIGHTBOX_QUALITY } from '../utils/photos';

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

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft')  { e.preventDefault(); onPrev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); onNext(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPrev, onNext]);

  // Lock the page behind the overlay while the lightbox is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Warm the browser cache with the neighbors so arrow/swipe feels instant
  useEffect(() => {
    if (photos.length < 2) return;
    [1, -1].forEach((d) => {
      const im = new Image();
      im.src = photoSrc(photos[(index + d + photos.length) % photos.length], 1280, LIGHTBOX_QUALITY);
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
          of the site because this is the one image someone is actually
          studying. A phone (96vw of ~390px at DPR 3 ≈ 1123px) lands on 1280;
          a retina laptop at 88vw takes 2048. */}
      <img
        key={photos[index]}
        className="lb-img"
        src={photoSrc(photos[index], 1280, LIGHTBOX_QUALITY)}
        srcSet={photoSrcSet(photos[index], [960, 1280, 1600, 2048], LIGHTBOX_QUALITY)}
        sizes="(max-width: 768px) 96vw, 88vw"
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
