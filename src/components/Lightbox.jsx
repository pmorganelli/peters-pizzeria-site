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
      <div className="lb-close">✕ close</div>
      <img
        className="lb-img"
        src={photos[index]}
        alt="Photo"
        onClick={(e) => e.stopPropagation()}
      />
      {photos.length > 1 && (
        <>
          <div className="lb-arrow lb-prev" onClick={(e) => { e.stopPropagation(); onPrev(); }}>&#8592;</div>
          <div className="lb-arrow lb-next" onClick={(e) => { e.stopPropagation(); onNext(); }}>&#8594;</div>
          <div className="lb-counter">{index + 1} / {photos.length}</div>
        </>
      )}
    </div>
  );
}
