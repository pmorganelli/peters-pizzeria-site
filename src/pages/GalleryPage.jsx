import { useEffect } from 'react';
import { Footer } from '../components/Footer';
import { ALL_PHOTOS } from '../data/posts';

export function GalleryPage({ nav, openLightbox }) {
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
        {ALL_PHOTOS.map((src, i) => (
          <div
            key={i}
            className="gallery-item"
            onClick={() => openLightbox(ALL_PHOTOS, i)}
          >
            <img
              src={src}
              alt={`Peter's Pizzeria photo ${i + 1}`}
              onError={(e) => { e.target.closest('.gallery-item').style.display = 'none'; }}
            />
          </div>
        ))}
      </div>

      <Footer nav={nav} />
    </div>
  );
}
