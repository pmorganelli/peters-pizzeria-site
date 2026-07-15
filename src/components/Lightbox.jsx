import { useEffect, useRef } from 'react';
import { X, ArrowLeft, ArrowRight } from 'lucide-react';
import { webSrc } from '../utils/photos';

export function Lightbox({ photos, index, onClose, onPrev, onNext }) {
  const touchX = useRef(null);
  const dialogRef = useRef(null);

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
      im.src = webSrc(photos[(index + d + photos.length) % photos.length]);
    });
  }, [index, photos]);

  return (
    <dialog
      ref={dialogRef}
      className="lb-overlay"
      aria-label="Photo lightbox"
      onClick={onClose}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (dx > 50) onPrev();
        else if (dx < -50) onNext();
        touchX.current = null;
      }}
    >
      <button type="button" className="lb-close" aria-label="Close lightbox" onClick={(e) => { e.stopPropagation(); onClose(); }}><X size={13} /> close</button>
      <img
        key={photos[index]}
        className="lb-img"
        src={webSrc(photos[index])}
        srcSet={`${webSrc(photos[index])} 1600w, ${photos[index]} 3600w`}
        sizes="(max-width: 768px) 96vw, 88vw"
        alt="Enlarged view"
        onClick={(e) => e.stopPropagation()}
      />
      {photos.length > 1 && (
        <>
          <button type="button" className="lb-arrow lb-prev" aria-label="Previous photo" onClick={(e) => { e.stopPropagation(); onPrev(); }}><ArrowLeft size={20} strokeWidth={1.5} /></button>
          <button type="button" className="lb-arrow lb-next" aria-label="Next photo" onClick={(e) => { e.stopPropagation(); onNext(); }}><ArrowRight size={20} strokeWidth={1.5} /></button>
          {/* stopPropagation: bottom-center is a natural thumb rest on phones —
              a tap here must not bubble to the dialog's onClick and close it */}
          <div className="lb-counter" onClick={(e) => e.stopPropagation()}>{index + 1} / {photos.length}</div>
        </>
      )}
    </dialog>
  );
}
