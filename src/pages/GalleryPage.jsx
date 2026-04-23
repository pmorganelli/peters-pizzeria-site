import { useEffect, useState } from 'react';
import { Footer } from '../components/Footer';
import { ALL_PHOTOS } from '../data/posts';

export function GalleryPage({ nav, openLightbox }) {
  const [failed, setFailed] = useState(new Set());

  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className="gallery-page">
      <div className="gallery-hero">
        <div className="section-label" style={{ color: 'var(--gold)' }}>Gallery</div>
        <h1 className="gallery-hero-title">From the<br /><em>kitchen &amp; beyond.</em></h1>
        <p className="gallery-hero-sub">
          {ALL_PHOTOS.length} photos · Tap to enlarge · Use Arrow keys to browse
        </p>
      </div>

      <div className="gallery-grid">
        {ALL_PHOTOS.filter((src) => !failed.has(src)).map((src, i, visible) => (
          <button
            key={src}
            className="gallery-item"
            onClick={() => openLightbox(visible, i)}
            aria-label={`View photo ${i + 1}`}
          >
            <img
              src={src}
              alt={`Peter's Pizzeria photo ${i + 1}`}
              onError={() => setFailed((prev) => new Set([...prev, src]))}
            />
          </button>
        ))}
      </div>

      <Footer nav={nav} />
    </div>
  );
}
