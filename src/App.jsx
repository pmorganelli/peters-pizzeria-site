import { useState, useEffect, useCallback, useRef } from 'react';
import { Nav }         from './components/Nav';
import { Lightbox }    from './components/Lightbox';
import { HomePage }    from './pages/HomePage';
import { MenuPage }    from './pages/MenuPage';
import { BlogPage }    from './pages/BlogPage';
import { ArticlePage } from './pages/ArticlePage';
import { GalleryPage } from './pages/GalleryPage';
import { StudioPage }  from './pages/StudioPage';
import { OrderPage }   from './pages/OrderPage';
import { AdminPage }   from './pages/AdminPage';

const TRANSITION_MS = 260;
const VALID_PAGES = ['home', 'menu', 'blog', 'gallery', 'studio', 'order', 'admin'];

export default function App() {
  const [page,    setPage]    = useState(() => {
    const saved = localStorage.getItem('pp_page2');
    if (saved === 'article') return 'blog';
    return VALID_PAGES.includes(saved) ? saved : 'home';
  });
  const [article, setArticle] = useState(null);
  // 'out' slides the old page up, 'enter' parks the new page below (no transition), 'in' rests
  const [phase, setPhase] = useState('in');
  const [lbPhotos, setLbPhotos] = useState([]);
  const [lbIndex,  setLbIndex]  = useState(0);
  const [lbOpen,   setLbOpen]   = useState(false);
  const pending = useRef({});
  const navTimer = useRef(null);
  const navRaf = useRef(null);

  useEffect(() => { localStorage.setItem('pp_page2', page); }, [page]);

  const nav = useCallback((newPage, newArticle = null) => {
    if (navTimer.current) clearTimeout(navTimer.current);
    if (navRaf.current) cancelAnimationFrame(navRaf.current);
    setPhase('out');
    pending.current = { page: newPage, article: newArticle };
    navTimer.current = setTimeout(() => {
      if (pending.current.article) setArticle(pending.current.article);
      setPage(pending.current.page);
      setPhase('enter');
      navRaf.current = requestAnimationFrame(() => {
        navRaf.current = requestAnimationFrame(() => { setPhase('in'); navRaf.current = null; });
      });
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
          opacity:    phase === 'in' ? 1 : 0,
          transform:  phase === 'in' ? 'none' : phase === 'out' ? 'translateY(-14px)' : 'translateY(18px)',
          transition: phase === 'enter' ? 'none' : `opacity ${TRANSITION_MS}ms ease, transform ${TRANSITION_MS}ms ease`,
        }}
      >
        {page === 'home'    && <HomePage    {...pageProps} />}
        {page === 'menu'    && <MenuPage    nav={nav} />}
        {page === 'blog'    && <BlogPage    nav={nav} openArticle={openArticle} />}
        {page === 'article' && <ArticlePage article={article} nav={nav} />}
        {page === 'gallery' && <GalleryPage nav={nav} openLightbox={openLightbox} />}
        {page === 'studio'  && <StudioPage  nav={nav} />}
        {page === 'order'   && <OrderPage   nav={nav} />}
        {page === 'admin'   && <AdminPage   nav={nav} />}
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
