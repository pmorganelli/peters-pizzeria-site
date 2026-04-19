import { useEffect } from 'react';
import { Footer } from '../components/Footer';

function BackArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArticlePage({ article, nav }) {
  useEffect(() => { window.scrollTo(0, 0); }, [article]);

  if (!article) return null;

  return (
    <div className="article-page">
      <span className="article-back" onClick={() => nav('blog')}>
        <BackArrow />
        Back to Blog
      </span>

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
        <div style={{ margin: '0 60px 40px', maxWidth: 720 }}>
          <img
            src={article.img}
            alt={article.title}
            style={{ width: '100%', maxHeight: 400, objectFit: 'cover', display: 'block' }}
          />
        </div>
      )}

      <div className="article-divider" />

      <div className="article-body">
        <p style={{ fontSize: 20, color: 'var(--ink)', fontStyle: 'italic', marginBottom: 28 }}>
          {article.content.intro}
        </p>
        {article.content.sections.map((s, i) => (
          <div key={i}>
            <h2>{s.heading}</h2>
            {s.body && <p>{s.body}</p>}
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

      <Footer nav={nav} />
    </div>
  );
}
