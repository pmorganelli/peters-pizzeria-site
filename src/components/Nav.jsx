import { useState } from 'react';
import { LogoBadge } from './LogoBadge';
import { useScrolled } from '../hooks/useScrolled';

const PAGES = ['home', 'menu', 'blog', 'gallery'];

export function Nav({ page, nav }) {
  const scrolled = useScrolled();
  const [menuOpen, setMenuOpen] = useState(false);

  const doNav = (p) => { setMenuOpen(false); nav(p); };
  const isDark = ['home', 'gallery', 'blog', 'menu'].includes(page);

  return (
    <nav className={[scrolled ? 'scrolled' : '', isDark ? 'nav-dark' : ''].filter(Boolean).join(' ')}>
      <div className="nav-logo-wrap" onClick={() => doNav('home')}>
        <LogoBadge size={44} />
        <div className="nav-logo-text">Peter&apos;s Pizzeria</div>
      </div>

      <div className={`nav-links${menuOpen ? ' mobile-open' : ''}`}>
        {PAGES.map((p) => (
          <span
            key={p}
            className={`nav-link ${page === p ? 'active' : ''}`}
            onClick={() => doNav(p)}
          >
            {p}
          </span>
        ))}
      </div>

      <button className="nav-order-btn" onClick={() => doNav('menu')}>Order Now</button>

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
