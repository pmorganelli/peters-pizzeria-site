import { useState, useEffect, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Nav }         from './components/Nav';
import { Lightbox }    from './components/Lightbox';
import { HomePage }    from './pages/HomePage';
import { MenuPage }    from './pages/MenuPage';
import { BlogPage }    from './pages/BlogPage';
import { ArticlePage } from './pages/ArticlePage';
import { GalleryPage } from './pages/GalleryPage';
import { StudioPage }  from './pages/StudioPage';
import { OrderPage }   from './pages/OrderPage';
import { StatusPage }  from './pages/StatusPage';
import { AdminPage }   from './pages/AdminPage';

gsap.registerPlugin(ScrollTrigger);

const TRANSITION_MS = 260;
const VALID_PAGES = ['home', 'menu', 'blog', 'gallery', 'studio', 'order', 'status', 'admin'];

export default function App() {
  const [page,    setPage]    = useState(() => {
    const saved = localStorage.getItem('pp_page2');
    if (saved === 'article') return 'blog';
    return VALID_PAGES.includes(saved) ? saved : 'home';
  });
  const [article, setArticle] = useState(null);
  const [lbPhotos, setLbPhotos] = useState([]);
  const [lbIndex,  setLbIndex]  = useState(0);
  const [lbOpen,   setLbOpen]   = useState(false);
  const pending = useRef({});
  const navTimer = useRef(null);
  const navRaf = useRef(null);
  const refreshTimer = useRef(null);
  // The transition (old page slides up/out, new page rises in) is driven
  // imperatively on this wrapper node. Routing it through state instead would
  // re-render the whole mounted page three times per switch (out/enter/in) —
  // a visible cost on phones when tapping between pages quickly.
  const wrapRef = useRef(null);
  const pageNow = useRef(page);
  pageNow.current = page;

  useEffect(() => { localStorage.setItem('pp_page2', page); }, [page]);

  const nav = useCallback((newPage, newArticle = null) => {
    const el = wrapRef.current;
    const inFlight = navTimer.current !== null || navRaf.current !== null;
    // Re-tapping the current (or already-pending) page shouldn't replay the
    // whole unmount/mount cycle — just head back to the top.
    if (!newArticle && newPage === (inFlight ? pending.current.page : pageNow.current)) {
      if (!inFlight) window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (navTimer.current) clearTimeout(navTimer.current);
    if (navRaf.current) cancelAnimationFrame(navRaf.current);
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    const transition = `opacity ${TRANSITION_MS}ms ease, transform ${TRANSITION_MS}ms ease`;
    // Promote the wrapper to its own layer for the whole out→in sequence so the
    // compositor isn't re-rasterizing the page at each phase; cleared on settle.
    el.style.willChange = 'opacity, transform';
    el.style.transition = transition;
    el.style.opacity = '0';
    el.style.transform = 'translateY(-14px)';
    pending.current = { page: newPage, article: newArticle };
    navTimer.current = setTimeout(() => {
      // Park the (invisible) wrapper below its resting spot before the swap…
      el.style.transition = 'none';
      el.style.transform = 'translateY(18px)';
      // …and commit the new page synchronously so it's in the DOM before the
      // rise starts two frames from now.
      flushSync(() => {
        if (pending.current.article) setArticle(pending.current.article);
        setPage(pending.current.page);
      });
      navRaf.current = requestAnimationFrame(() => {
        navRaf.current = requestAnimationFrame(() => {
          el.style.transition = transition;
          el.style.opacity = '1';
          el.style.transform = 'none';
          navRaf.current = null;
        });
      });
      // Clear the inline styles as soon as the rise settles: while a transform
      // (or will-change: transform) is active the wrapper is a containing block
      // for position:fixed descendants, e.g. the order page's bottom bar.
      refreshTimer.current = setTimeout(() => {
        el.style.willChange = '';
        el.style.transition = '';
        el.style.opacity = '';
        el.style.transform = '';
        // The new page mounted while the wrapper was translated 18px, so its
        // ScrollTriggers measured offset start positions. Re-measure — but only
        // after the entrance reveal tweens finish (~0.3s max delay + 0.85s
        // duration): refresh() forces a full layout pass, and running it
        // mid-tween causes a visible hitch on phones. The interim 18px error
        // in trigger starts is imperceptible.
        refreshTimer.current = setTimeout(() => {
          ScrollTrigger.refresh();
          refreshTimer.current = null;
        }, 1100);
      }, TRANSITION_MS + 150);
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

      {/* Transition styles are applied imperatively in nav() — no style prop,
          so React re-renders never clobber them. */}
      <div ref={wrapRef}>
        {page === 'home'    && <HomePage    {...pageProps} />}
        {page === 'menu'    && <MenuPage    nav={nav} />}
        {page === 'blog'    && <BlogPage    nav={nav} openArticle={openArticle} />}
        {page === 'article' && <ArticlePage article={article} nav={nav} />}
        {page === 'gallery' && <GalleryPage nav={nav} openLightbox={openLightbox} />}
        {page === 'studio'  && <StudioPage  nav={nav} />}
        {page === 'order'   && <OrderPage   nav={nav} />}
        {page === 'status'  && <StatusPage  nav={nav} />}
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
