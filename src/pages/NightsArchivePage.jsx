import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
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
  // Two taps to delete, same as the community-wall takedown: the first arms,
  // the second commits. A confirm() dialog would block the page, and this is
  // rare enough that an armed button sitting there is no burden.
  const [armedId, setArmedId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  useEffect(() => {
    let cancelled = false;
    api('/api/login')
      .then((d) => {
        if (cancelled) return;
        // history: 'replace' — this is a bounce, not a navigation. Pushing it
        // would leave /admin/nights sitting in the Back history, so Back would
        // land here and bounce again.
        if (!d.authenticated) { nav('admin', null, { history: 'replace' }); return; }
        setAuthed(true);
      })
      .catch(() => { if (!cancelled) nav('admin', null, { history: 'replace' }); });
    return () => { cancelled = true; };
  }, [nav]);

  useEffect(() => {
    if (!authed) return;
    api('/api/nights')
      .then((d) => setNights(d.nights))
      .catch((err) => setError(err.message || 'Could not load past nights.'));
  }, [authed]);

  // Deleting a night is irreversible — the orders behind it were wiped when it
  // closed, so this record is the last copy. Worth it for clearing out test
  // nights before opening; there is nothing to restore afterward.
  const removeNight = async (night) => {
    if (armedId !== night.id) { setArmedId(night.id); return; }
    setArmedId(null);
    setBusyId(night.id);
    setError('');
    try {
      await api(`/api/nights?id=${encodeURIComponent(night.id)}`, { method: 'DELETE' });
      setNights((list) => list.filter((n) => n.id !== night.id));
      // A deleted night can't stay expanded underneath itself.
      setExpandedId((id) => (id === night.id ? null : id));
    } catch (err) {
      setError(err.message || 'Could not delete that night — try again.');
      // Resync rather than guess at what the server kept: a 404 here means
      // another tab already deleted it, and the row should go anyway.
      api('/api/nights').then((d) => setNights(d.nights)).catch(() => {});
    } finally {
      setBusyId(null);
    }
  };

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
              const armed = armedId === n.id;
              const busy = busyId === n.id;
              const label = fmtNightDate(n.closedAt);
              return (
                <div key={n.id} className="nights-list-item">
                  {/* The expand toggle and the delete button are siblings, not
                      nested — a button inside a button is invalid HTML and the
                      inner one's clicks would also toggle the row. */}
                  <div className="nights-list-head">
                    <button type="button"
                      className="nights-list-row"
                      onClick={() => setExpandedId(open ? null : n.id)}
                      aria-expanded={open}
                    >
                      {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span className="nights-list-date">{label}</span>
                      <span className="nights-list-sub">
                        {n.doneCount} picked up{n.cancelledCount > 0 ? `, ${n.cancelledCount} cancelled` : ''}
                      </span>
                      <span className="nights-list-total">{fmtMoney(n.totalCents)}</span>
                    </button>
                    <button type="button"
                      className={`nights-delete${armed ? ' nights-delete-armed' : ''}`}
                      onClick={() => removeNight(n)}
                      // Clicking away disarms, so a half-pressed delete never
                      // sits waiting for an accidental second click later.
                      onBlur={() => setArmedId((id) => (id === n.id ? null : id))}
                      disabled={busy}
                      aria-label={armed ? `Confirm delete of ${label}` : `Delete ${label}`}
                      title={armed ? 'Permanent — click again to confirm' : 'Delete this night'}
                    >
                      {busy ? 'Deleting…' : armed ? 'Delete for good?' : <Trash2 size={14} />}
                    </button>
                  </div>
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
