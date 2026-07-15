import { useEffect, useState } from 'react';
import { Footer } from '../components/Footer';
import { ALL_PHOTOS } from '../data/posts';
import { PHOTO_RATIOS } from '../data/photoDims';
import { thumbSrc } from '../utils/photos';

export function GalleryPage({ nav, openLightbox }) {
  const [failed, setFailed] = useState(new Set());
  // The lightbox gets this same array, so indices stay aligned after failures
  const visible = ALL_PHOTOS.filter((src) => !failed.has(src));

  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className="gallery-page">
      <div className="gallery-hero">
        <div className="section-label" style={{ color: 'var(--gold)' }}>Gallery</div>
        <h1 className="gallery-hero-title">From the<br /><em>kitchen &amp; beyond.</em></h1>
        <p className="gallery-hero-sub">
          {ALL_PHOTOS.length} photos · Tap to enlarge · Swipe to browse
        </p>
      </div>

      <div className="gallery-grid">
        {visible.map((src, i) => (
          <button type="button"
            key={src}
            className="gallery-item"
            onClick={() => openLightbox(visible, i)}
            aria-label={`View photo ${i + 1}`}
          >
            <img
              src={thumbSrc(src)}
              alt={`Peter's Pizzeria — view ${i + 1}`}
              loading="lazy"
              decoding="async"
              /* Reserving the final box keeps the masonry from reflowing as photos load */
              style={{ aspectRatio: PHOTO_RATIOS[src] }}
              onError={() => setFailed((prev) => new Set([...prev, src]))}
            />
          </button>
        ))}
      </div>

      <Footer nav={nav} />
    </div>
  );
}
