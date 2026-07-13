import { useEffect } from 'react';
import { ChevronLeft, ArrowRight } from 'lucide-react';
import { Footer } from '../components/Footer';
import { POSTS_BY_DATE } from '../data/posts';
import { thumbSrc, webSrc } from '../utils/photos';
import { LineReveal } from '../components/LineReveal';

function ArticleFigure({ img, heading, index, ratio = '4/3' }) {
  const src = typeof img === 'string' ? img : img.src;
  const caption = typeof img === 'string' ? null : img.caption;
  return (
    <figure style={{ margin: 0 }}>
      <img
        src={webSrc(src)}
        alt={caption || `${heading} photo ${index + 1}`}
        loading="lazy"
        decoding="async"
        style={{ width: '100%', aspectRatio: ratio, objectFit: 'cover', display: 'block' }}
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
}

export function ArticlePage({ article, nav }) {
  useEffect(() => { window.scrollTo(0, 0); }, [article]);

  if (!article || !article.content) return null;

  const idx = POSTS_BY_DATE.findIndex((p) => p.id === article.id);
  const next = POSTS_BY_DATE.length > 1 ? POSTS_BY_DATE[(idx + 1) % POSTS_BY_DATE.length] : null;

  return (
    <div className="article-page">
      <div className="article-back-row">
        <button type="button" className="article-back" onClick={() => nav('blog')}>
          <ChevronLeft size={14} strokeWidth={1.5} />
          Back to Blog
        </button>
      </div>

      <div className="article-hero">
        <div className="article-tag">{article.tag}</div>
        <LineReveal as="h1" className="article-title" text={article.title} />
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
            src={webSrc(article.img)}
            alt={article.title}
            style={{ width: '100%', aspectRatio: '16/9', maxHeight: 400, objectFit: 'cover', display: 'block' }}
          />
        </div>
      )}

      <div className="article-divider" />

      <div className="article-body">
        {article.content.intro && (
          <p className="article-intro" style={{ fontSize: 20, color: 'var(--ink)', marginBottom: 28 }}>
            {article.content.intro}
          </p>
        )}
        {(article.content.sections ?? []).map((s) => (
          <div key={s.heading}>
            <h2>{s.heading}</h2>
            {/* Magazine treatment: a lone figure floats right and the text wraps around it */}
            {s.images && s.images.length === 1 && (
              <div className="article-fig-float">
                <ArticleFigure img={s.images[0]} heading={s.heading} index={0} ratio="4/5" />
              </div>
            )}
            {s.body && <p>{s.body}</p>}
            {s.images && s.images.length > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, margin: '16px 0 28px' }}>
                {s.images.map((img, j) => (
                  <ArticleFigure key={j} img={img} heading={s.heading} index={j} />
                ))}
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
          <button type="button" className="article-next-card" onClick={() => nav('article', next)} aria-label={`Read next: ${next.title}`}>
            <img src={thumbSrc(next.img)} alt="" loading="lazy" decoding="async" />
            <div>
              <div className="article-next-meta">{next.tag} · {next.date}</div>
              <div className="article-next-title">{next.title}</div>
              <div className="article-next-cta">Read article <ArrowRight size={12} /></div>
            </div>
          </button>
        </div>
      )}

      <Footer nav={nav} />
    </div>
  );
}
