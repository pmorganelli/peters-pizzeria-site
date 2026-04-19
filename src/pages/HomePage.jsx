import { useEffect } from 'react';
import { Footer } from '../components/Footer';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { BLOG_POSTS } from '../data/posts';

const STORY_PHOTOS     = ['/photos/team.jpg', '/photos/hug1.jpg', '/photos/img_6084.jpeg', '/photos/img_5976.jpeg', '/photos/img_6831.jpeg'];
const STRIP_PHOTOS     = ['/photos/img_5984.jpeg', '/photos/img_6664.jpeg', '/photos/img_9315.jpeg', '/photos/img_6123.jpeg'];
const COMMUNITY_PHOTOS = ['/photos/img_1082.jpeg', '/photos/img_6789.jpeg', '/photos/img_1098.jpeg'];
const MOSAIC_PHOTOS    = [
  '/photos/img_6084.jpeg', '/photos/img_5976.jpeg', '/photos/img_6831.jpeg', '/photos/img_9383.jpeg',
  '/photos/img_6132.jpeg', '/photos/img_5925.jpeg', '/photos/img_2220.jpeg', '/photos/img_3337.jpeg',
];
const SPECIALS = [
  { tag: 'Special',             name: 'Pesto Slice',        desc: 'House-made pesto sauce, cheese', price: '$4' },
  { tag: 'Slice of the Week',   name: 'Nduja & Hot Honey',  desc: 'Spicy Calabrian nduja, house hot honey, stracciatella', price: '$4' },
  { tag: 'Special',             name: 'Vodka Slice',        desc: 'House-made vodka sauce, cheese', price: '$4' },
];

export function HomePage({ nav, openArticle, openLightbox }) {
  const ref = useScrollReveal();

  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div>
      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero-img" />
        <div className="hero-overlay" />
        <div className="hero-label">Tufts University · Medford, MA · Est. 2025</div>
        <h1 className="hero-title">Handmade<br />with <em>love.</em></h1>
        <p className="hero-sub">
          A student-run pizzeria from the heart of Tufts. Twelve passionate students, one shared kitchen,
          love, and a 72-hour ferment.
        </p>
        <div className="hero-ctas">
          <button className="btn-primary" onClick={() => nav('menu')}>See the Menu</button>
          <button className="btn-ghost"   onClick={() => nav('blog')}>Read the Blog</button>
        </div>
        <div className="hero-scroll">
          <div className="scroll-line" />
          scroll
        </div>
      </section>

      {/* ── STORY ── */}
      <section className="story-section">
        <div ref={ref(0)} className="reveal">
          <div className="section-label">Our Story</div>
          <h2 className="section-title">A hole in the wall,<br /><em>with a lot of heart.</em></h2>
        </div>

        <div className="story-grid">
          <div ref={ref(1)} className="reveal reveal-delay-1 story-photo-stack">
            <img
              className="story-photo-main"
              src="/photos/team.jpg"
              alt="The team"
              style={{ cursor: 'pointer' }}
              onClick={() => openLightbox(STORY_PHOTOS, 0)}
            />
            <img
              className="story-photo-inset"
              src="/photos/hug1.jpg"
              alt="The crew"
              style={{ cursor: 'pointer' }}
              onClick={() => openLightbox(STORY_PHOTOS, 1)}
            />
          </div>

          <div className="story-text">
            <div className="reveal reveal-delay-2" ref={ref(2)}>
              <p>We started Peter&apos;s Pizzeria junior year — a few friends stayed up until three in the morning one night for an idea to build community.</p>
              <p>Now there's over a dozen of us, united by the same obsession: making the best pizza in Somerville. We ferment our dough 72 hours, fire it in an Ooni at 900°F for Neapolitan style pizzas, and Pizza Steels at 550°F for New York style pizzas.</p>
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
        {[
          { src: '/photos/img_6831.jpeg', alt: 'Fresh from the oven' },
          { src: '/photos/img_9383.jpeg', alt: 'Pizza night' },
          { src: '/photos/img_5963.jpeg', alt: 'Kitchen action' },
          { src: '/photos/img_0967.jpeg', alt: 'The crew' },
        ].map((p, i) => (
          <div key={i} className="photo-strip-item" onClick={() => openLightbox(STRIP_PHOTOS, i)}>
            <img src={p.src} alt={p.alt} />
          </div>
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
          <span className="specials-see-all" onClick={() => nav('menu')}>Full Menu →</span>
        </div>
        <div className="specials-grid">
          {SPECIALS.map((s, i) => (
            <div key={i} className={`special-card reveal reveal-delay-${i + 1}`} ref={ref(3 + i)}>
              <div className="special-tag">{s.tag}</div>
              <div className="special-name">{s.name}</div>
              <div className="special-desc">{s.desc}</div>
              <div className="special-price">{s.price}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── LATEST BLOG POSTS ── */}
      <section style={{ background: 'var(--cream)', padding: '100px 60px' }}>
        <div ref={ref(6)} className="reveal" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 48 }}>
          <div>
            <div className="section-label">From the Blog</div>
            <h2 className="section-title">Latest from<br /><em>the kitchen.</em></h2>
          </div>
          <span
            style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--red)', cursor: 'pointer', borderBottom: '1px solid var(--red)', paddingBottom: 2 }}
            onClick={() => nav('blog')}
          >
            All Posts →
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 28 }}>
          {BLOG_POSTS.slice(0, 3).map((post, i) => (
            <div
              key={post.id}
              ref={ref(7 + i)}
              className={`blog-card reveal reveal-delay-${i + 1}`}
              onClick={() => openArticle(post)}
            >
              <div className="blog-card-img">
                <img src={post.img} alt={post.title} />
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
            </div>
          ))}
        </div>
      </section>

      {/* ── COMMUNITY ── */}
      <section style={{ background: 'var(--green)', padding: '80px 60px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }}>
        <div>
          <div className="section-label" style={{ color: 'var(--gold)' }}>Community</div>
          <h2 className="section-title" style={{ color: 'var(--cream)', marginBottom: 20 }}>
            We make pizza.<br /><em style={{ color: 'var(--gold)' }}>We make community.</em>
          </h2>
          <p style={{ fontFamily: 'var(--serif)', fontSize: 18, fontStyle: 'italic', color: 'rgba(254,245,239,0.7)', lineHeight: 1.75 }}>
            Every Saturday night is more than a meal. It&apos;s our passion. The people yearn for community at Tufts, and we provide it.
            We pride ourselves on affordable pizza, great community, and some of the best slices you&apos;ll ever have.
            Come find us — follow @peterspizzeria_ on Instagram to keep up with the latest!
          </p>
          <button
            className="btn-primary"
            style={{ marginTop: 28, background: 'var(--gold)', color: 'var(--ink)' }}
            onClick={() => nav('gallery')}
          >
            See Our Photos →
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <img src="/photos/img_1082.jpeg" alt="Kitchen" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', cursor: 'pointer' }} onClick={() => openLightbox(COMMUNITY_PHOTOS, 0)} />
          <img src="/photos/img_6789.jpeg" alt="Team"    style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', cursor: 'pointer' }} onClick={() => openLightbox(COMMUNITY_PHOTOS, 1)} />
          <img src="/photos/img_1098.jpeg" alt="Pizza"   style={{ width: '100%', aspectRatio: '3/2', objectFit: 'cover', gridColumn: '1/-1', cursor: 'pointer' }} onClick={() => openLightbox(COMMUNITY_PHOTOS, 2)} />
        </div>
      </section>

      <Footer nav={nav} />
    </div>
  );
}
