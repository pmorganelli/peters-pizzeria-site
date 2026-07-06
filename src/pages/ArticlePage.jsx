import { useEffect } from 'react';
import { Footer } from '../components/Footer';
import { POSTS_BY_DATE } from '../data/posts';

function BackArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArticlePage({ article, nav }) {
  useEffect(() => { window.scrollTo(0, 0); }, [article]);

  if (!article || !article.content) return null;

  const idx = POSTS_BY_DATE.findIndex((p) => p.id === article.id);
  const next = POSTS_BY_DATE.length > 1 ? POSTS_BY_DATE[(idx + 1) % POSTS_BY_DATE.length] : null;

  return (
    <div className="article-page">
      <button className="article-back" onClick={() => nav('blog')}>
        <BackArrow />
        Back to Blog
      </button>

      <div className="article-hero">
        <div className="article-tag">{article.tag}</div>
        <h1 className="article-title">{article.title}</h1>
        <div className="article-meta">
          <span>{article.date}</span>
          <span>·</span>
          <span>{article.author}</span>
          <span>·</span>
          <span>{article.readTime}</span>
        </div>
      </div>

      {article.img && (
        <div className="article-hero-img">
          <img
            src={article.img}
            alt={article.title}
            style={{ width: '100%', maxHeight: 400, objectFit: 'cover', display: 'block' }}
          />
        </div>
      )}

      <div className="article-divider" />

      <div className="article-body">
        {article.content.intro && (
          <p style={{ fontSize: 20, color: 'var(--ink)', fontStyle: 'italic', marginBottom: 28 }}>
            {article.content.intro}
          </p>
        )}
        {(article.content.sections ?? []).map((s, i) => (
          <div key={i}>
            <h2>{s.heading}</h2>
            {s.body && <p>{s.body}</p>}
            {s.images && s.images.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, margin: '16px 0 28px' }}>
                {s.images.map((img, j) => {
                  const src = typeof img === 'string' ? img : img.src;
                  const caption = typeof img === 'string' ? null : img.caption;
                  return (
                    <figure key={j} style={{ margin: 0 }}>
                      <img
                        src={src}
                        alt={caption || `${s.heading} photo ${j + 1}`}
                        loading="lazy"
                        decoding="async"
                        style={{ width: '100%', maxHeight: 480, objectFit: 'cover', display: 'block' }}
                      />
                      {caption && (
                        <figcaption style={{
                          fontFamily: 'var(--serif)',
                          fontSize: 14,
                          fontStyle: 'italic',
                          color: 'var(--ink2)',
                          marginTop: 8,
                          lineHeight: 1.5,
                        }}>
                          {caption}
                        </figcaption>
                      )}
                    </figure>
                  );
                })}
              </div>
            )}
            {s.recipe && (
              <div className="recipe-box">
                <h3>{s.recipe.title}</h3>
                <ul>
                  {s.recipe.items.map((item, j) => <li key={j}>{item}</li>)}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>

      {next && (
        <div className="article-next">
          <div className="article-next-label">Read next</div>
          <button className="article-next-card" onClick={() => nav('article', next)} aria-label={`Read next: ${next.title}`}>
            <img src={next.img} alt="" loading="lazy" decoding="async" />
            <div>
              <div className="article-next-meta">{next.tag} · {next.date}</div>
              <div className="article-next-title">{next.title}</div>
              <div className="article-next-cta">Read article →</div>
            </div>
          </button>
        </div>
      )}

      <Footer nav={nav} />
    </div>
  );
}
