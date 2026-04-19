import { useEffect } from 'react';
import { Footer } from '../components/Footer';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { BLOG_POSTS } from '../data/posts';

export function BlogPage({ nav, openArticle }) {
  const ref = useScrollReveal();

  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className="blog-page">
      <div className="blog-hero">
        <div className="blog-hero-bg" />
        {/* Bug fix: original had garbled "JournlAlign:'middle'}}/>Journal" text */}
        <div className="section-label" style={{ color: 'var(--gold)', position: 'relative', zIndex: 1 }}>
          Journal
        </div>
        <h1 className="blog-hero-title">Recipes, stories,<br /><em>&amp; inspirations.</em></h1>
        <p className="blog-hero-sub">New posts every week — what we&apos;re making, learning, and eating.</p>
      </div>

      <div className="blog-body">
        <div className="blog-grid">
          {BLOG_POSTS.map((post, i) => (
            <div
              key={post.id}
              ref={ref(i)}
              className={`blog-card reveal reveal-delay-${(i % 3) + 1}`}
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
      </div>

      <Footer nav={nav} />
    </div>
  );
}
