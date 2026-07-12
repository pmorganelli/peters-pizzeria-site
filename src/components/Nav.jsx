import { useState } from 'react';
import { LogoBadge } from './LogoBadge';
import { useScrolled } from '../hooks/useScrolled';

const PAGES = [
  ['home', 'Home'],
  ['menu', 'Menu'],
  ['blog', 'Blog'],
  ['gallery', 'Gallery'],
  ['status', 'Slice Status'],
];

export function Nav({ page, nav }) {
  const scrolled = useScrolled();
  const [menuOpen, setMenuOpen] = useState(false);

  const doNav = (p) => { setMenuOpen(false); nav(p); };
  const isDark = ['home', 'gallery', 'blog', 'menu', 'studio', 'admin'].includes(page);

  return (
    <nav className={[scrolled ? 'scrolled' : '', isDark ? 'nav-dark' : ''].filter(Boolean).join(' ')}>
      <button className="nav-logo-wrap" onClick={() => doNav('home')} aria-label="Go to home page">
        <LogoBadge size={44} />
        <div className="nav-logo-text">Peter&apos;s Pizzeria</div>
      </button>

      <div className={`nav-links${menuOpen ? ' mobile-open' : ''}`}>
        {PAGES.map(([id, label]) => (
          <button
            key={id}
            className={`nav-link ${page === id ? 'active' : ''}`}
            onClick={() => doNav(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <button className="nav-order-btn" onClick={() => doNav('order')}>Order Now</button>

      <button
        className={`nav-hamburger${menuOpen ? ' open' : ''}`}
        onClick={() => setMenuOpen((o) => !o)}
        aria-label="Menu"
      >
        <span /><span /><span />
      </button>
    </nav>
  );
}
