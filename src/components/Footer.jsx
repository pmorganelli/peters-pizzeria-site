import { AtSign } from 'lucide-react';
import { LogoBadge } from './LogoBadge';

const PAGES = ['home', 'menu', 'blog', 'gallery'];

export function Footer({ nav }) {
  return (
    <footer>
      <div className="footer-top">
        <div className="footer-brand">
          <div className="footer-logo-wrap">
            <LogoBadge size={40} />
            <div className="footer-wordmark">Peter&apos;s Pizzeria</div>
          </div>
          <div className="footer-tagline">
            A student-run pizzeria at Tufts University. Handmade with care, fired every Saturday.
          </div>
        </div>

        <div>
          <div className="footer-col-title">Navigate</div>
          {PAGES.map((p) => (
            <button
              key={p}
              className="footer-link"
              onClick={() => nav(p)}
              style={{ textTransform: 'capitalize' }}
            >
              {p}
            </button>
          ))}
        </div>

        <div>
          <div className="footer-col-title">Hours</div>
          <div className="footer-link footer-static">Saturdays, 7pm til sellout</div>
          <div className="footer-col-title footer-col-gap">Pay</div>
          <a
            className="footer-link"
            href="https://venmo.com/u/Peter-Morganelli24"
            target="_blank"
            rel="noreferrer"
          >
            Venmo @Peter-Morganelli24
          </a>
        </div>

        <div>
          <div className="footer-col-title">Find Us</div>
          <div className="footer-link footer-static">Tufts University · Somerville, MA</div>
          <a
            className="footer-link footer-ig"
            href="https://instagram.com/peterspizzeria_"
            target="_blank"
            rel="noreferrer"
          >
            <AtSign size={13} /> peterspizzeria_ for location
          </a>
        </div>
      </div>

      <div className="footer-bottom">
        <span>© 2026 Peter&apos;s Pizzeria · Not affiliated with Tufts University</span>
        <button onClick={() => nav('admin')}>Admin</button>
      </div>
    </footer>
  );
}
