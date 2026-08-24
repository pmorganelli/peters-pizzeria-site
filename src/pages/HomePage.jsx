import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Footer } from '../components/Footer';
import { LogoBadge } from '../components/LogoBadge';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { POSTS_BY_DATE } from '../data/posts';
import { MENU_DATA } from '../data/menu';
import { api } from '../utils/api';
import { responsiveImg } from '../utils/photos';


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
  section.items.flatMap((it) => (it.special ? [{ tag: it.special, ...it }] : []))
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

  // The hero photo used to drift on scroll (a scrubbed yPercent parallax).
  // It's gone deliberately — don't add it back without reading this:
  //
  //  * It read as the photo zooming rather than drifting. The image is sized
  //    with `cover` inside a box 12% taller than the hero, so sliding it
  //    changes which crop of a scaled-up photo shows through the window, and
  //    the eye takes that as scale, not position.
  //  * It was unreliable. ScrollTrigger cached its start/end before the hero
  //    had its final height, so the scrub range could collapse and the tween
  //    would sit at progress 0 all the way down — moving on some loads and
  //    not others, which is worse than either.
  //  * It's a scrubbed transform on a viewport-sized image, repainting on
  //    every scroll frame. It was already disabled below 768px for exactly
  //    that cost; the cost is real above 768px too.
  //
  // With no drift, `.hero-img` is `inset: 0` — the old `-12%` top existed only
  // to keep the drift from exposing an edge, and left the photo cropped high.

  return (
    <div ref={pageRef}>
      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero-img" />
        <div className="hero-overlay" />
        <div className="hero-badge" aria-hidden="true"><LogoBadge size={128} /></div>
        <div className="hero-pill">Re-opening: Fall 2026</div>
        {/* Non-breaking spaces inside each segment: the label may only wrap at the dots */}
        <div className="hero-label">Somerville,&nbsp;MA · Est.&nbsp;2025</div>
        <h1 className="hero-title">Handmade<br />with <em>love.</em></h1>
        <p className="hero-sub">
          A student-run pizzeria from the heart of Somerville. Twelve passionate students,
          one kitchen, a 72-hour ferment, and a love for community.
        </p>
        <div className="hero-ctas">
          <button type="button" className="btn-primary" onClick={() => nav('menu')}>See the Menu</button>
          <button type="button" className="btn-ghost"   onClick={() => nav('blog')}>Read the Blog</button>
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
            <button type="button" className="story-photo-btn" onClick={() => openLightbox(STORY_PHOTOS, 0)} aria-label="View team photo">
              <img
                className="story-photo-main"
                /* Stacked and capped at 560px below 900px (see .story-photo-stack), half the grid above it */
                {...responsiveImg('/photos/team.jpg', '(max-width: 900px) min(560px, 92vw), 44vw', [320, 640, 960, 1280, 1600])}
                alt="The team" loading="lazy" decoding="async"
              />
            </button>
            <button type="button" className="story-photo-btn story-photo-inset-btn" onClick={() => openLightbox(STORY_PHOTOS, 1)} aria-label="View crew photo">
              <img
                className="story-photo-inset"
                /* 34% of the stack it's pinned to — never large, whatever the viewport */
                {...responsiveImg('/photos/hug1.jpg', '(max-width: 900px) 190px, 15vw', [320, 640, 960])}
                alt="The crew" loading="lazy" decoding="async"
              />
            </button>
          </div>

          <div className="story-text">
            <div className="reveal reveal-delay-2" ref={ref(2)}>
              <p>We started Peter&apos;s Pizzeria junior year. A few friends stayed up until three in the morning with an idea: build community for Tufts and make great, affordable pizza.</p>
              <p>Now there are over a dozen of us, united by the same obsession of expanding our student business. We ferment our dough for three days, fire it in an Ooni at 900°F for Neapolitan style pizzas, and Pizza Steels at 550°F for New York style pizzas.</p>
              <p>We sell out every single week, usually in about an hour. ~12 pizzas per night, come try it for yourself!</p>
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
          <button type="button" key={p.src} className="photo-strip-item" onClick={() => openLightbox(STRIP_SRCS, i)} aria-label={p.alt}>
            <img {...responsiveImg(p.src, '(max-width: 768px) 50vw, 25vw', [320, 640, 960, 1280])} alt={p.alt} loading="lazy" decoding="async" />
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
          <button type="button" className="specials-see-all" onClick={() => nav('menu')}>Full Menu <ArrowRight size={13} /></button>
        </div>
        <div className="specials-grid">
          {SPECIALS.map((s, i) => {
            const soldOut = unavailable.has(s.name);
            return (
              <button type="button"
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
          <button type="button"
            className="text-link-btn"
            onClick={() => nav('blog')}
          >
            All Posts <ArrowRight size={12} />
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))', gap: 28 }}>
          {LATEST_POSTS.map((post, i) => (
            <button type="button"
              key={post.id}
              ref={ref(7 + i)}
              className={`blog-card reveal reveal-delay-${i + 1}`}
              onClick={() => openArticle(post)}
              aria-label={`Read: ${post.title}`}
            >
              <div className="blog-card-img">
                <img {...responsiveImg(post.img, '(max-width: 768px) 92vw, (max-width: 1100px) 46vw, 340px', [320, 640, 960, 1280])} alt={post.title} loading="lazy" decoding="async" />
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
          <div className="section-label">Community</div>
          <h2 className="section-title" style={{ color: 'var(--cream)', marginBottom: 20 }}>
            We make pizza.<br /><em style={{ color: 'var(--gold)' }}>We make community.</em>
          </h2>
          <p style={{ fontFamily: 'var(--serif)', fontSize: 18, color: 'rgba(254,245,239,0.7)', lineHeight: 1.75 }}>
            Every Saturday night is more than a meal. It&apos;s our passion. The people yearn for community at Tufts, and we provide it.
            We pride ourselves on affordable pizza, great community, and some of the best slices you&apos;ll ever have.
            Come find us: follow{' '}
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
          <button type="button"
            className="btn-primary"
            style={{ marginTop: 28, background: 'var(--gold)', color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', gap: 8 }}
            onClick={() => nav('gallery')}
          >
            See Our Photos <ArrowRight size={14} />
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button type="button" className="photo-btn" onClick={() => openLightbox(COMMUNITY_PHOTOS, 0)} aria-label="View kitchen photo">
            <img {...responsiveImg('/photos/img_1082.jpeg', '(max-width: 768px) 46vw, 22vw', [320, 640, 960, 1280])} alt="Kitchen" loading="lazy" decoding="async" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
          </button>
          <button type="button" className="photo-btn" onClick={() => openLightbox(COMMUNITY_PHOTOS, 1)} aria-label="View team photo">
            <img {...responsiveImg('/photos/img_6789.jpeg', '(max-width: 768px) 46vw, 22vw', [320, 640, 960, 1280])} alt="Team" loading="lazy" decoding="async" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
          </button>
          <button type="button" className="photo-btn" onClick={() => openLightbox(COMMUNITY_PHOTOS, 2)} aria-label="View pizza photo" style={{ gridColumn: '1/-1' }}>
            <img {...responsiveImg('/photos/img_1098.jpeg', '(max-width: 768px) 92vw, 44vw', [320, 640, 960, 1280, 1600])} alt="Pizza" loading="lazy" decoding="async" style={{ width: '100%', aspectRatio: '3/2', objectFit: 'cover', display: 'block' }} />
          </button>
        </div>
      </section>

      <Footer nav={nav} />
    </div>
  );
}
