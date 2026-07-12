import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowRight } from 'lucide-react';
import { Footer } from '../components/Footer';
import { LogoBadge } from '../components/LogoBadge';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { POSTS_BY_DATE } from '../data/posts';
import { MENU_DATA } from '../data/menu';
import { api } from '../utils/api';
import { thumbSrc, webSrc } from '../utils/photos';

gsap.registerPlugin(useGSAP, ScrollTrigger);

const STORY_PHOTOS     = ['/photos/team.jpg', '/photos/hug1.jpg', '/photos/img_6084.jpeg', '/photos/img_5976.jpeg', '/photos/img_6831.jpeg'];
const STRIP_ITEMS      = [
  { src: '/photos/img_6831.jpeg', alt: 'Fresh from the oven' },
  { src: '/photos/img_9383.jpeg', alt: 'Pizza night' },
  { src: '/photos/img_5963.jpeg', alt: 'Kitchen action' },
  { src: '/photos/img_0967.jpeg', alt: 'The crew' },
];
const STRIP_SRCS       = STRIP_ITEMS.map((p) => p.src);
const COMMUNITY_PHOTOS = ['/photos/img_1082.jpeg', '/photos/img_6789.jpeg', '/photos/img_1098.jpeg'];
// Specials come straight from the menu (items tagged `special`), so the
// homepage and the order page always agree on what exists and what's sold out.
const SPECIALS = MENU_DATA.flatMap((section) =>
  section.items.filter((it) => it.special).map((it) => ({ tag: it.special, ...it }))
);

const LATEST_POSTS = POSTS_BY_DATE.slice(0, 3);

const TICKER_TEXT = 'Saturday Slices · 7pm til sellout · Somerville, MA · ';

export function HomePage({ nav, openArticle, openLightbox }) {
  const ref = useScrollReveal();
  const pageRef = useRef(null);
  const [unavailable, setUnavailable] = useState(new Set());

  useEffect(() => { window.scrollTo(0, 0); }, []);

  // Sold-out items grey out on the specials strip; fail silent if the check fails
  useEffect(() => {
    let cancelled = false;
    api('/api/store')
      .then((d) => { if (!cancelled) setUnavailable(new Set(d.unavailable || [])); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Hero photo drifts slower than the page scroll (parallax)
  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.to('.hero-img', {
      yPercent: 10,
      ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
    });
  }, { scope: pageRef });

  return (
    <div ref={pageRef}>
      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero-img" />
        <div className="hero-overlay" />
        <div className="hero-badge" aria-hidden="true"><LogoBadge size={128} /></div>
        <div className="hero-pill"><span className="pulse-dot" aria-hidden="true" />Re-opening: Fall 2026</div>
        {/* Non-breaking spaces inside each segment: the label may only wrap at the dots */}
        <div className="hero-label">Somerville,&nbsp;MA · Est.&nbsp;2025</div>
        <h1 className="hero-title">Handmade<br />with <em>love.</em></h1>
        <p className="hero-sub">
          A student-run pizzeria from the heart of Somerville. Twelve passionate students,
          one shared kitchen, and a 72-hour ferment.
        </p>
        <div className="hero-ctas">
          <button className="btn-primary" onClick={() => nav('menu')}>See the Menu</button>
          <button className="btn-ghost"   onClick={() => nav('blog')}>Read the Blog</button>
        </div>
        <div className="hero-scroll" aria-hidden="true">
          <div className="scroll-line" />
          scroll
        </div>
      </section>

      {/* ── TICKER ── */}
      <div className="ticker" aria-hidden="true">
        <div className="ticker-track">
          <span>{TICKER_TEXT.repeat(3)}</span>
          <span>{TICKER_TEXT.repeat(3)}</span>
        </div>
      </div>

      {/* ── STORY ── */}
      <section className="story-section">
        <div ref={ref(0)} className="reveal">
          <div className="section-label">Our Story</div>
          <h2 className="section-title">A hole in the wall,<br /><em>with a lot of heart.</em></h2>
        </div>

        <div className="story-grid">
          <div ref={ref(1)} className="reveal reveal-delay-1 story-photo-stack">
            <button className="story-photo-btn" onClick={() => openLightbox(STORY_PHOTOS, 0)} aria-label="View team photo">
              <img className="story-photo-main" src={webSrc('/photos/team.jpg')} alt="The team" />
            </button>
            <button className="story-photo-btn story-photo-inset-btn" onClick={() => openLightbox(STORY_PHOTOS, 1)} aria-label="View crew photo">
              <img className="story-photo-inset" src={thumbSrc('/photos/hug1.jpg')} alt="The crew" />
            </button>
          </div>

          <div className="story-text">
            <div className="reveal reveal-delay-2" ref={ref(2)}>
              <p>We started Peter&apos;s Pizzeria junior year — a few friends stayed up until three in the morning with an idea: build community.</p>
              <p>Now there are over a dozen of us, united by the same obsession: making the best pizza in Somerville. We ferment our dough 72 hours, fire it in an Ooni at 900°F for Neapolitan style pizzas, and Pizza Steels at 550°F for New York style pizzas.</p>
              <p>We sell out every week. We learn something new every time. And we&apos;re just getting started.</p>
              <div className="story-stat">
                <div><div className="stat-num">12</div><div className="stat-label">Students</div></div>
                <div><div className="stat-num">72h</div><div className="stat-label">Dough Ferment</div></div>
                <div><div className="stat-num">900°</div><div className="stat-label">Ooni Temp</div></div>
                <div><div className="stat-num">550°</div><div className="stat-label">Steel Temp</div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PHOTO STRIP ── */}
      <div className="photo-strip">
        {STRIP_ITEMS.map((p, i) => (
          <button key={p.src} className="photo-strip-item" onClick={() => openLightbox(STRIP_SRCS, i)} aria-label={p.alt}>
            <img src={thumbSrc(p.src)} alt={p.alt} loading="lazy" decoding="async" />
          </button>
        ))}
      </div>

      {/* ── SPECIALS ── */}
      <section className="specials-strip">
        <div className="specials-header">
          <div>
            <div className="section-label">From the Kitchen</div>
            <h2 className="section-title" style={{ color: 'var(--cream)' }}>
              This week&apos;s <em style={{ color: 'var(--red)' }}>specials.</em>
            </h2>
          </div>
          <button className="specials-see-all" onClick={() => nav('menu')}>Full Menu <ArrowRight size={13} /></button>
        </div>
        <div className="specials-grid">
          {SPECIALS.map((s, i) => {
            const soldOut = unavailable.has(s.name);
            return (
              <button
                key={s.name}
                className={`special-card reveal reveal-delay-${i + 1}${soldOut ? ' special-sold-out' : ''}`}
                ref={ref(3 + i)}
                onClick={() => nav('menu')}
                aria-label={`${s.tag}: ${s.name} — ${soldOut ? 'sold out' : s.price}`}
              >
                <div className="special-tag">{s.tag}{soldOut && <span className="special-soldout-tag"> · Sold out</span>}</div>
                <div className="special-name">{s.name}</div>
                <div className="special-desc">{s.desc}</div>
                <div className="special-price">{s.price}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── LATEST BLOG POSTS ── */}
      <section className="home-latest">
        <div ref={ref(6)} className="reveal home-latest-header">
          <div>
            <div className="section-label">From the Blog</div>
            <h2 className="section-title">Latest from<br /><em>the kitchen.</em></h2>
          </div>
          <button
            className="text-link-btn"
            onClick={() => nav('blog')}
          >
            All Posts <ArrowRight size={12} />
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))', gap: 28 }}>
          {LATEST_POSTS.map((post, i) => (
            <button
              key={post.id}
              ref={ref(7 + i)}
              className={`blog-card reveal reveal-delay-${i + 1}`}
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
      </section>

      {/* ── COMMUNITY ── */}
      <section className="community-section">
        <div>
          <div className="section-label" style={{ color: 'var(--gold)' }}>Community</div>
          <h2 className="section-title" style={{ color: 'var(--cream)', marginBottom: 20 }}>
            We make pizza.<br /><em style={{ color: 'var(--gold)' }}>We make community.</em>
          </h2>
          <p style={{ fontFamily: 'var(--serif)', fontSize: 18, color: 'rgba(254,245,239,0.7)', lineHeight: 1.75 }}>
            Every Saturday night is more than a meal. It&apos;s our passion. The people yearn for community at Tufts, and we provide it.
            We pride ourselves on affordable pizza, great community, and some of the best slices you&apos;ll ever have.
            Come find us — follow{' '}
            <a
              href="https://instagram.com/peterspizzeria_"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--gold)', textDecoration: 'none', borderBottom: '1px solid rgba(200,147,58,0.5)' }}
            >
              @peterspizzeria_
            </a>{' '}
            on Instagram to keep up with the latest!
          </p>
          <button
            className="btn-primary"
            style={{ marginTop: 28, background: 'var(--gold)', color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', gap: 8 }}
            onClick={() => nav('gallery')}
          >
            See Our Photos <ArrowRight size={14} />
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button className="photo-btn" onClick={() => openLightbox(COMMUNITY_PHOTOS, 0)} aria-label="View kitchen photo">
            <img src={thumbSrc('/photos/img_1082.jpeg')} alt="Kitchen" loading="lazy" decoding="async" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
          </button>
          <button className="photo-btn" onClick={() => openLightbox(COMMUNITY_PHOTOS, 1)} aria-label="View team photo">
            <img src={thumbSrc('/photos/img_6789.jpeg')} alt="Team" loading="lazy" decoding="async" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
          </button>
          <button className="photo-btn" onClick={() => openLightbox(COMMUNITY_PHOTOS, 2)} aria-label="View pizza photo" style={{ gridColumn: '1/-1' }}>
            <img src={webSrc('/photos/img_1098.jpeg')} alt="Pizza" loading="lazy" decoding="async" style={{ width: '100%', aspectRatio: '3/2', objectFit: 'cover', display: 'block' }} />
          </button>
        </div>
      </section>

      <Footer nav={nav} />
    </div>
  );
}
