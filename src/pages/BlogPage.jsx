import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Footer } from '../components/Footer';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { POSTS_BY_DATE } from '../data/posts';
import { thumbSrc } from '../utils/photos';
import { LineReveal } from '../components/LineReveal';

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function BlogPage({ nav, openArticle }) {
  const ref = useScrollReveal();
  const pageRef = useRef(null);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  // Hero background drifts slower than the page scroll (parallax)
  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.to('.blog-hero-bg', {
      yPercent: 14,
      ease: 'none',
      scrollTrigger: { trigger: '.blog-hero', start: 'top top', end: 'bottom top', scrub: true },
    });
  }, { scope: pageRef });

  return (
    <div className="blog-page" ref={pageRef}>
      <div className="blog-hero">
        <div className="blog-hero-bg" />
        <div className="section-label" style={{ color: 'var(--gold)', position: 'relative', zIndex: 1 }}>
          Blog
        </div>
        <h1 className="blog-hero-title">Recipes, stories,<br /><em>&amp; inspirations.</em></h1>
        <LineReveal
          as="p"
          className="blog-hero-sub"
          text="New posts every week — what we're making, learning, and eating."
        />
      </div>

      <div className="blog-body">
        <div className="blog-grid">
          {POSTS_BY_DATE.map((post, i) => (
            <button type="button"
              key={post.id}
              ref={ref(i)}
              className={`blog-card reveal reveal-delay-${(i % 3) + 1}`}
              onClick={() => openArticle(post)}
              aria-label={`Read: ${post.title}`}
            >
              <div className="blog-card-img">
                <img src={thumbSrc(post.img)} alt={post.title} loading="lazy" decoding="async" />
                <div className="blog-card-tag">{post.tag}</div>
              </div>
              <div className="blog-card-body">
                <div className="blog-card-date">{post.date}</div>
                <div className="blog-card-title">{post.title}</div>
                <div className="blog-card-excerpt">{post.excerpt}</div>
              </div>
              <div className="blog-card-footer">
                <span className="blog-card-author">{post.author}</span>
                <span className="blog-card-read">{post.readTime}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <Footer nav={nav} />
    </div>
  );
}
