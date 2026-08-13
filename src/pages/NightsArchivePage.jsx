import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react';
import { Footer } from '../components/Footer';
import { api } from '../utils/api';
import { fmtMoney, formatOrderItems } from '../utils/orders';

// Same lowercase wording the admin board's own Finished list uses ("picked
// up", "cancelled") — a night closed mid-service can still carry an order
// that never reached a terminal state, so this covers those too.
const STATUS_TEXT = { new: 'received', firing: 'in the oven', ready: 'ready', done: 'picked up', cancelled: 'cancelled' };
const statusLabel = (status) => STATUS_TEXT[status] ?? status;

// 'en-US' rather than the browser locale — the board should read the same way
// no matter whose laptop it's open on.
const fmtNightDate = (ts) =>
  new Date(ts).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

// Admin-only revenue history: every night the board was closed, with the full
// per-order breakdown archived at that moment (api/nights.js). Reached only
// from a link on the admin board — there's no nav entry point, same as the
// board itself.
export function NightsArchivePage({ nav }) {
  // null = still checking; false only ever bounces back to /admin before this
  // page renders anything, so there's no "logged out" state to show here.
  const [authed, setAuthed] = useState(null);
  const [nights, setNights] = useState(null);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  useEffect(() => {
    let cancelled = false;
    api('/api/login')
      .then((d) => {
        if (cancelled) return;
        if (!d.authenticated) { nav('admin'); return; }
        setAuthed(true);
      })
      .catch(() => { if (!cancelled) nav('admin'); });
    return () => { cancelled = true; };
  }, [nav]);

  useEffect(() => {
    if (!authed) return;
    api('/api/nights')
      .then((d) => setNights(d.nights))
      .catch((err) => setError(err.message || 'Could not load past nights.'));
  }, [authed]);

  if (authed === null || (authed && nights === null)) {
    return (
      <div className="admin-page">
        <div className="admin-loading">Loading…</div>
      </div>
    );
  }
  if (!authed) return null; // redirect to /admin is already in flight

  return (
    <div className="admin-page">
      <div className="admin-head">
        <div>
          <button type="button" className="text-link-btn nights-back" onClick={() => nav('admin')}>
            <ArrowLeft size={13} /> Back to board
          </button>
          <div className="section-label" style={{ color: 'var(--gold)' }}>Admin</div>
          <h1 className="admin-title">Past <em>nights.</em></h1>
        </div>
      </div>

      <div className="admin-body">
        {error && <div className="order-error admin-store-error" role="alert">{error}</div>}

        {nights.length === 0 ? (
          <div className="fire-empty">No nights closed yet.</div>
        ) : (
          <div className="nights-list">
            {nights.map((n) => {
              const open = expandedId === n.id;
              return (
                <div key={n.id} className="nights-list-item">
                  <button type="button"
                    className="nights-list-row"
                    onClick={() => setExpandedId(open ? null : n.id)}
                    aria-expanded={open}
                  >
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className="nights-list-date">{fmtNightDate(n.closedAt)}</span>
                    <span className="nights-list-sub">
                      {n.doneCount} picked up{n.cancelledCount > 0 ? `, ${n.cancelledCount} cancelled` : ''}
                    </span>
                    <span className="nights-list-total">{fmtMoney(n.totalCents)}</span>
                  </button>
                  {open && (
                    <div className="nights-detail">
                      {(n.orders ?? []).length === 0 ? (
                        <div className="nights-detail-empty">No orders recorded for this night.</div>
                      ) : n.orders.map((o) => (
                        <div key={o.id} className="finished-row">
                          <span className="oc-code">#{o.code}</span>
                          <span>{o.name}</span>
                          <span className="finished-items">{formatOrderItems(o.items)}</span>
                          <span>{fmtMoney(o.totalCents)}</span>
                          <span className={`finished-status${o.status === 'done' ? ' finished-done' : o.status === 'cancelled' ? ' finished-cancelled' : ''}`}>
                            {statusLabel(o.status)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Footer nav={nav} />
    </div>
  );
}
