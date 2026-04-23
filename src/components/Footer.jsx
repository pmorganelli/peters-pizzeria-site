import { LogoBadge } from './LogoBadge';

const PAGES = ['home', 'menu', 'blog', 'gallery'];

export function Footer({ nav }) {
  return (
    <footer>
      <div className="footer-top">
        <div>
          <div className="footer-logo-wrap">
            <LogoBadge size={40} />
            <div style={{ fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 700, fontStyle: 'italic', color: 'var(--cream)' }}>
              Peter&apos;s Pizzeria
            </div>
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
          <div className="footer-link" style={{ cursor: 'default' }}>Saturday Slices</div>
          <div className="footer-link" style={{ cursor: 'default', fontSize: 13 }}>Saturdays, 7pm-sellout (~1 hour)</div>
        </div>

        <div>
          <div className="footer-col-title">Find Us</div>
          <div className="footer-link" style={{ cursor: 'default' }}>Tufts University</div>
          <div className="footer-link" style={{ cursor: 'default' }}>Somerville, MA</div>
          <div className="footer-link" style={{ cursor: 'default', fontSize: 13 }}>@peterspizzeria_ for location</div>
        </div>
      </div>

      <div className="footer-bottom">
        <span>© 2026 Peter&apos;s Pizzeria · Tufts University</span>
        <span>Venmo: @Peter-Morganelli24</span>
      </div>
    </footer>
  );
}
