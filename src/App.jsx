import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
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
import { SlicesPage }  from './pages/SlicesPage';
import { AdminPage }   from './pages/AdminPage';
import { NightsArchivePage } from './pages/NightsArchivePage';

gsap.registerPlugin(ScrollTrigger);

const TRANSITION_MS = 260;
const VALID_PAGES = ['home', 'menu', 'blog', 'gallery', 'studio', 'order', 'status', 'slices', 'admin', 'nights'];

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
  const [lbCaptions, setLbCaptions] = useState(null);
  // Bumped in the same batch as the page swap purely so the rise below always
  // gets a commit to hang off — navigating to the page that's already mounted
  // (article → same article) changes no other state, and a layout effect that
  // never runs would strand the wrapper at opacity 0.
  const [navTick, setNavTick] = useState(0);
  const pending = useRef({});
  const navTimer = useRef(null);
  const navRaf = useRef(null);
  const refreshTimer = useRef(null);
  // Separate from refreshTimer because the ScrollTrigger re-measure is now
  // scheduled alongside the style-clear rather than chained behind it.
  const scrollRefreshTimer = useRef(null);
  // Non-null between "nav() asked for the new page" and "the rise started":
  // holds the transition string the rise should use. Also keeps nav()'s
  // in-flight guard true across that gap, which navTimer/navRaf don't cover.
  const riseTransition = useRef(null);
  // The transition (old page slides up/out, new page rises in) is driven
  // imperatively on this wrapper node. Routing it through state instead would
  // re-render the whole mounted page three times per switch (out/enter/in) —
  // a visible cost on phones when tapping between pages quickly.
  const wrapRef = useRef(null);
  // Mirrors the committed page for nav()'s guards. Synced in an effect, not
  // during render — React can replay or discard render work (StrictMode,
  // concurrent features), and a discarded render must not leak into the ref.
  // A *layout* effect, so it lands in the same phase that clears
  // riseTransition below: a passive effect flushes in a later task, leaving a
  // window where the swap is no longer "requested" but pageNow still names the
  // page we just left — and a tap in that window takes the reverse-fade
  // shortcut, which reveals the new page without navigating anywhere.
  const pageNow = useRef(page);
  useLayoutEffect(() => { pageNow.current = page; }, [page]);

  useEffect(() => { localStorage.setItem('pp_page2', page); }, [page]);

  // Second half of nav()'s swap: the new page is now committed to the DOM
  // (that's what a layout effect guarantees — it runs after React's mutation
  // pass, before the browser paints), parked 18px low and invisible, so the
  // rise can start. This used to be a flushSync() inside nav() forcing the
  // commit early; a layout effect gets the same ordering without opting the
  // update out of concurrent rendering.
  useLayoutEffect(() => {
    const transition = riseTransition.current;
    const el = wrapRef.current;
    // Locals own what this run scheduled, so the teardown below can release
    // every allocation unconditionally. The refs mirror them because nav() has
    // to cancel the same set when a navigation interrupts one mid-flight —
    // that happens on a tap, with no re-render to drive this effect's cleanup.
    let raf = 0;
    let settleTimer = 0;
    let scrollTimer = 0;
    if (transition && el) {
      riseTransition.current = null;
      // Two frames so the parked position is painted before the transition to
      // it is armed — one frame can coalesce the two and skip the rise.
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => {
          el.style.transition = transition;
          el.style.opacity = '1';
          el.style.transform = 'none';
          raf = 0;
          navRaf.current = null;
        });
        navRaf.current = raf;
      });
      navRaf.current = raf;
      // Clear the inline styles as soon as the rise settles: while a transform
      // (or will-change: transform) is active the wrapper is a containing block
      // for position:fixed descendants, e.g. the order page's bottom bar.
      settleTimer = setTimeout(() => {
        el.style.willChange = '';
        el.style.transition = '';
        el.style.opacity = '';
        el.style.transform = '';
        settleTimer = 0;
        refreshTimer.current = null;
      }, TRANSITION_MS + 150);
      refreshTimer.current = settleTimer;
      // The new page mounted while the wrapper was translated 18px, so its
      // ScrollTriggers measured offset start positions. Re-measure — but only
      // after the entrance reveal tweens finish (~0.3s max delay + 0.85s
      // duration): refresh() forces a full layout pass, and running it
      // mid-tween causes a visible hitch on phones. The interim 18px error in
      // trigger starts is imperceptible. Scheduled flat rather than nested in
      // the settle timer above so both ids stay cancellable from one place.
      scrollTimer = setTimeout(() => {
        ScrollTrigger.refresh();
        scrollTimer = 0;
        scrollRefreshTimer.current = null;
      }, TRANSITION_MS + 150 + 1100);
      scrollRefreshTimer.current = scrollTimer;
    }
    // Release everything if another nav lands (this effect re-runs) or App
    // unmounts, so a stale rise can't fire against a wrapper that moved on.
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settleTimer);
      clearTimeout(scrollTimer);
      navRaf.current = null;
      refreshTimer.current = null;
      scrollRefreshTimer.current = null;
    };
  }, [navTick]);

  const nav = useCallback((newPage, newArticle = null) => {
    const el = wrapRef.current;
    // Swap already asked for but not yet committed: `page` state is the new
    // page even though pageNow (synced in a passive effect) still reads the
    // old one, so the reverse-the-fade shortcut below can't trust pageNow here.
    const swapRequested = riseTransition.current !== null;
    const inFlight = navTimer.current !== null || navRaf.current !== null || swapRequested;
    // Re-tapping the current (or already-pending) page shouldn't replay the
    // whole unmount/mount cycle — just head back to the top.
    if (!newArticle && newPage === (inFlight ? pending.current.page : pageNow.current)) {
      if (!inFlight) window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    // Null every ref as it's cancelled. The early returns below (reverse-fade,
    // reduced motion) leave without bumping navTick, so the layout effect's
    // cleanup — the only other place these get released — never runs. A ref
    // left holding a dead timer id keeps inFlight true forever, and the guard
    // above then matches every later tap on pending.current.page and silently
    // drops it: that page becomes unreachable until you visit another one.
    if (navTimer.current) clearTimeout(navTimer.current);
    navTimer.current = null;
    if (navRaf.current) cancelAnimationFrame(navRaf.current);
    navRaf.current = null;
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = null;
    if (scrollRefreshTimer.current) clearTimeout(scrollRefreshTimer.current);
    scrollRefreshTimer.current = null;
    // Drop any rise the previous nav() had queued but that hasn't committed
    // yet — otherwise it fires on top of the fade-out being set up below.
    riseTransition.current = null;
    // Reduced motion: swap instantly. The CSS reduced-motion block forces
    // transition-duration to ~0 (!important beats inline styles), so the fade
    // choreography below would just blank the page for the whole 260ms timeout.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Clear any leftovers from a fade that was in flight when the
      // preference flipped — otherwise the wrapper could stay at opacity 0.
      el.style.willChange = '';
      el.style.transition = '';
      el.style.opacity = '';
      el.style.transform = '';
      if (newArticle) setArticle(newArticle);
      setPage(newPage);
      return;
    }
    const transition = `opacity ${TRANSITION_MS}ms ease, transform ${TRANSITION_MS}ms ease`;
    // Tapping back to the still-rendered page mid-fade-out: reverse the fade
    // in place rather than completing a swap to the same page (which would
    // replay the whole out/in for nothing).
    if (inFlight && !swapRequested && !newArticle && newPage === pageNow.current) {
      el.style.transition = transition;
      el.style.opacity = '1';
      el.style.transform = 'none';
      refreshTimer.current = setTimeout(() => {
        el.style.willChange = '';
        el.style.transition = '';
        el.style.opacity = '';
        el.style.transform = '';
        refreshTimer.current = null;
      }, TRANSITION_MS + 150);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
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
      // …and ask for the new page. The rise is picked up by the layout effect
      // above, which runs once React has actually committed it to the DOM.
      riseTransition.current = transition;
      if (pending.current.article) setArticle(pending.current.article);
      setPage(pending.current.page);
      setNavTick((n) => n + 1);
      navTimer.current = null;
    }, TRANSITION_MS);
  }, []);

  const openArticle  = useCallback((post) => nav('article', post), [nav]);
  // `captions` is optional — only the community wall passes one.
  const openLightbox = useCallback((photos, index, captions = null) => {
    setLbPhotos(photos); setLbIndex(index); setLbCaptions(captions); setLbOpen(true);
  }, []);
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
        {page === 'slices'  && <SlicesPage  nav={nav} openLightbox={openLightbox} />}
        {page === 'admin'   && <AdminPage   nav={nav} />}
        {page === 'nights'  && <NightsArchivePage nav={nav} />}
      </div>

      {lbOpen && (
        <Lightbox
          photos={lbPhotos}
          captions={lbCaptions}
          index={lbIndex}
          onClose={() => setLbOpen(false)}
          onPrev={lbPrev}
          onNext={lbNext}
        />
      )}
    </>
  );
}
