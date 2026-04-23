import { useState, useEffect, useCallback, useRef } from 'react';
import { Nav }         from './components/Nav';
import { Lightbox }    from './components/Lightbox';
import { HomePage }    from './pages/HomePage';
import { MenuPage }    from './pages/MenuPage';
import { BlogPage }    from './pages/BlogPage';
import { ArticlePage } from './pages/ArticlePage';
import { GalleryPage } from './pages/GalleryPage';

const TRANSITION_MS = 260;

export default function App() {
  const [page,    setPage]    = useState(() => {
    const saved = localStorage.getItem('pp_page2') || 'home';
    return saved === 'article' ? 'blog' : saved;
  });
  const [article, setArticle] = useState(null);
  const [visible, setVisible] = useState(true);
  const [lbPhotos, setLbPhotos] = useState([]);
  const [lbIndex,  setLbIndex]  = useState(0);
  const [lbOpen,   setLbOpen]   = useState(false);
  const pending = useRef({});
  const navTimer = useRef(null);

  useEffect(() => { localStorage.setItem('pp_page2', page); }, [page]);

  const nav = useCallback((newPage, newArticle = null) => {
    if (navTimer.current) clearTimeout(navTimer.current);
    setVisible(false);
    pending.current = { page: newPage, article: newArticle };
    navTimer.current = setTimeout(() => {
      if (pending.current.article) setArticle(pending.current.article);
      setPage(pending.current.page);
      setVisible(true);
      navTimer.current = null;
    }, TRANSITION_MS);
  }, []);

  const openArticle  = useCallback((post) => nav('article', post), [nav]);
  const openLightbox = useCallback((photos, index) => { setLbPhotos(photos); setLbIndex(index); setLbOpen(true); }, []);
  const lbPrev = useCallback(() => setLbIndex((i) => (i - 1 + lbPhotos.length) % lbPhotos.length), [lbPhotos]);
  const lbNext = useCallback(() => setLbIndex((i) => (i + 1) % lbPhotos.length), [lbPhotos]);

  const pageProps = { nav, openArticle, openLightbox };

  return (
    <>
      <Nav page={page} nav={nav} />

      <div
        style={{
          opacity:    visible ? 1 : 0,
          transform:  visible ? 'none' : 'translateY(18px)',
          transition: `opacity ${TRANSITION_MS}ms ease, transform ${TRANSITION_MS}ms ease`,
        }}
      >
        {page === 'home'    && <HomePage    {...pageProps} />}
        {page === 'menu'    && <MenuPage    nav={nav} />}
        {page === 'blog'    && <BlogPage    nav={nav} openArticle={openArticle} />}
        {page === 'article' && <ArticlePage article={article} nav={nav} />}
        {page === 'gallery' && <GalleryPage nav={nav} openLightbox={openLightbox} />}
      </div>

      {lbOpen && (
        <Lightbox
          photos={lbPhotos}
          index={lbIndex}
          onClose={() => setLbOpen(false)}
          onPrev={lbPrev}
          onNext={lbNext}
        />
      )}
    </>
  );
}
