import { useEffect, useState } from 'react';
import { Footer } from '../components/Footer';
import { LineReveal } from '../components/LineReveal';
import { GALLERY_PHOTOS } from '../data/posts';
import { PHOTO_RATIOS } from '../data/photoDims';
import { photoSrc, photoSrcSet } from '../utils/photos';

export function GalleryPage({ nav, openLightbox }) {
  const [failed, setFailed] = useState(new Set());
  // The lightbox gets this same array, so indices stay aligned after failures
  const visible = GALLERY_PHOTOS.filter(({ src }) => !failed.has(src));
  const visibleSources = visible.map(({ src }) => src);
  const visibleAlts = visible.map(({ alt }) => alt);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className="gallery-page">
      <div className="gallery-hero">
        <div className="section-label" style={{ color: 'var(--gold)' }}>Gallery</div>
        <LineReveal as="h1" className="gallery-hero-title" splitKey="gallery-hero">
          From the<br /><em>kitchen &amp; beyond.</em>
        </LineReveal>
        <LineReveal
          as="p"
          className="gallery-hero-sub"
          text={`${GALLERY_PHOTOS.length} photos · Tap to enlarge · Swipe to browse`}
        />
      </div>

      <div className="gallery-grid">
        {visible.map(({ src, alt }, i) => (
          <button type="button"
            key={src}
            className="gallery-item"
            onClick={() => openLightbox(visibleSources, i, null, visibleAlts)}
            aria-label={`View larger: ${alt}`}
          >
            <img
              src={photoSrc(src, 640)}
              /* 4 masonry columns above 1080px, 2 below — so a tile is about a
                 quarter or a half of the viewport. Letting the browser choose
                 means a phone pulls a ~320px image where it used to take the
                 640px one built for desktop. */
              srcSet={photoSrcSet(src, [320, 640, 960])}
              sizes="(max-width: 1080px) 50vw, 25vw"
              alt={alt}
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
