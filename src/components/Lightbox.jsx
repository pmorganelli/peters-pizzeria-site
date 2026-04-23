import { useEffect, useRef } from 'react';

export function Lightbox({ photos, index, onClose, onPrev, onNext }) {
  const touchX = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape')     onClose();
      if (e.key === 'ArrowLeft')  onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);

  return (
    <div
      className="lb-overlay"
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
      <button className="lb-close" aria-label="Close lightbox">✕ close</button>
      <img
        className="lb-img"
        src={photos[index]}
        alt="Photo"
        onClick={(e) => e.stopPropagation()}
      />
      {photos.length > 1 && (
        <>
          <button className="lb-arrow lb-prev" aria-label="Previous photo" onClick={(e) => { e.stopPropagation(); onPrev(); }}>&#8592;</button>
          <button className="lb-arrow lb-next" aria-label="Next photo" onClick={(e) => { e.stopPropagation(); onNext(); }}>&#8594;</button>
          <div className="lb-counter">{index + 1} / {photos.length}</div>
        </>
      )}
    </div>
  );
}
