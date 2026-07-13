import { useEffect, useRef } from 'react';
import { X, ArrowLeft, ArrowRight } from 'lucide-react';
import { webSrc } from '../utils/photos';

export function Lightbox({ photos, index, onClose, onPrev, onNext }) {
  const touchX = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape')     onClose();
      if (e.key === 'ArrowLeft')  { e.preventDefault(); onPrev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); onNext(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);

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
    <div
      className="lb-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Photo lightbox"
      onClick={onClose}
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
        sizes="88vw"
        alt="Enlarged view"
        onClick={(e) => e.stopPropagation()}
      />
      {photos.length > 1 && (
        <>
          <button type="button" className="lb-arrow lb-prev" aria-label="Previous photo" onClick={(e) => { e.stopPropagation(); onPrev(); }}><ArrowLeft size={20} strokeWidth={1.5} /></button>
          <button type="button" className="lb-arrow lb-next" aria-label="Next photo" onClick={(e) => { e.stopPropagation(); onNext(); }}><ArrowRight size={20} strokeWidth={1.5} /></button>
          <div className="lb-counter">{index + 1} / {photos.length}</div>
        </>
      )}
    </div>
  );
}
