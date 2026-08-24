import { AtSign } from 'lucide-react';
import { LogoBadge } from './LogoBadge';

const PAGES = [
  ['home', 'Home'],
  ['menu', 'Menu'],
  ['blog', 'Blog'],
  ['gallery', 'Gallery'],
  ['status', 'Slice Status'],
  ['slices', 'Community Pictures'],
];

export function Footer({ nav }) {
  return (
    // NOT redundant, despite how it reads: this <footer> renders inside <main>
    // (see the ErrorBoundary/landmark note in CLAUDE.md), and a nested <footer>
    // is not a contentinfo landmark on its own. Dropping the role to satisfy
    // the rule would remove the landmark screen readers navigate to.
    // react-doctor-disable-next-line no-redundant-roles
    <footer role="contentinfo">
      <div className="footer-top">
        <div className="footer-brand">
          <div className="footer-logo-wrap">
            <LogoBadge size={40} />
            <div className="footer-wordmark">Peter&apos;s Pizzeria</div>
          </div>
          <div className="footer-tagline">
            A student-run pizzeria handmade with love and community as its core values. Fired every other Saturday.
          </div>
        </div>

        <div>
          <div className="footer-col-title">Navigate</div>
          {PAGES.map(([id, label]) => (
            <button type="button" key={id} className="footer-link" onClick={() => nav(id)}>
              {label}
            </button>
          ))}
        </div>

        <div>
          <div className="footer-col-title">Hours</div>
          <div className="footer-link footer-static">Saturdays, 7pm til sellout</div>
          <div className="footer-col-title footer-col-gap">Venmo</div>
          <a
            className="footer-link"
            href="https://venmo.com/u/Peter-Morganelli24"
            target="_blank"
            rel="noreferrer"
          >
            @Peter-Morganelli24
          </a>
        </div>

        <div>
          <div className="footer-col-title">Find Us</div>
          <div className="footer-link footer-static">Somerville, MA</div>
          <a
            className="footer-link footer-ig"
            href="https://instagram.com/peterspizzeria_"
            target="_blank"
            rel="noreferrer"
          >
            @peterspizzeria_ for location
          </a>
        </div>
      </div>

      <div className="footer-bottom">
        <span>2026 Peter&apos;s Pizzeria · Not affiliated with Tufts University</span>
        <button type="button" onClick={() => nav('admin')}>Admin</button>
      </div>
    </footer>
  );
}
