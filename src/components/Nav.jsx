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

export function Nav({ page, nav }) {
  const scrolled = useScrolled();
  // Store the route on which the menu was opened. A Back/Forward route change
  // makes `menuOpen` false immediately without a state-setting effect.
  const [menuOpenPage, setMenuOpenPage] = useState(null);
  const menuOpen = menuOpenPage === page;

  const doNav = (p) => { setMenuOpenPage(null); nav(p); };
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

      <button type="button" className="nav-order-btn" onClick={() => doNav('order')}>Order Now</button>

      <button type="button"
        className={`nav-hamburger${menuOpen ? ' open' : ''}`}
        onClick={() => setMenuOpenPage((openPage) => openPage === page ? null : page)}
        aria-label="Menu"
        aria-expanded={menuOpen}
        aria-controls="primary-navigation"
      >
        <span /><span /><span />
      </button>
    </nav>
  );
}
