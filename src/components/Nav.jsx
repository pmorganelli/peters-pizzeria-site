import { useState } from 'react';
import { LogoBadge } from './LogoBadge';
import { useScrolled } from '../hooks/useScrolled';

const PAGES = [
  ['home', 'Home'],
  ['menu', 'Menu'],
  ['blog', 'Blog'],
  ['gallery', 'Gallery'],
  ['status', 'Slice Status'],
  ['slices', 'Community Pictures'],
];

// The CTA slot is always filled — only its label and destination change with
// the session. Rendering nothing for a visitor pulled the nav off balance:
// the wordmark and the links are laid out against a button on the right, and
// without it everything drifted. So a visitor gets "See the Menu" where staff
// get "Order Now", and the bar keeps its shape either way.
//
// `isAdmin` is null until App's session check lands, and null takes the
// visitor treatment. That means an admin sees the label change once on load;
// it's two people, and a stable bar for everyone else is the better trade.
export function Nav({ page, nav, isAdmin }) {
  const scrolled = useScrolled();
  // The mobile menu closes on any route change, including a Back/Forward the
  // nav never hears about. This is the adjust-state-during-render pattern
  // rather than an effect: React re-runs this component before committing, so
  // the overlay never paints open on the new page.
  //
  // Deriving it instead (`menuOpen = openedOnPage === page`) looks equivalent
  // and isn't — the remembered page id outlives the route change, so opening
  // the menu on /menu, pressing Back, then pressing Forward re-satisfies the
  // comparison and the overlay reopens on its own.
  const [menuOpen, setMenuOpen] = useState(false);
  const [renderedPage, setRenderedPage] = useState(page);
  if (renderedPage !== page) {
    setRenderedPage(page);
    setMenuOpen(false);
  }

  const doNav = (p) => { setMenuOpen(false); nav(p); };
  const isDark = ['home', 'gallery', 'blog', 'menu', 'studio', 'slices', 'admin', 'nights'].includes(page);

  return (
    <nav className={[scrolled ? 'scrolled' : '', isDark ? 'nav-dark' : ''].filter(Boolean).join(' ')}>
      <button type="button" className="nav-logo-wrap" onClick={() => doNav('home')} aria-label="Go to home page">
        <LogoBadge size={44} />
        <div className="nav-logo-text">Peter&apos;s Pizzeria</div>
      </button>

      <div id="primary-navigation" className={`nav-links${menuOpen ? ' mobile-open' : ''}`}>
        {PAGES.map(([id, label]) => (
          <button type="button"
            key={id}
            className={`nav-link ${page === id ? 'active' : ''}`}
            onClick={() => doNav(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Ordering is staff-only — orders are taken at the window and typed
          into /order by whoever is running the board, and the API refuses an
          unauthenticated POST regardless. A visitor gets the menu instead,
          which is what the CTA was really doing for them anyway. */}
      {isAdmin === true
        ? <button type="button" className="nav-order-btn" onClick={() => doNav('order')}>Order Now</button>
        : <button type="button" className="nav-order-btn" onClick={() => doNav('menu')}>See the Menu</button>}

      <button type="button"
        className={`nav-hamburger${menuOpen ? ' open' : ''}`}
        onClick={() => setMenuOpen((open) => !open)}
        aria-label="Menu"
        aria-expanded={menuOpen}
        aria-controls="primary-navigation"
      >
        <span /><span /><span />
      </button>
    </nav>
  );
}
