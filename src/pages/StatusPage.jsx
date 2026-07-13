import { useEffect, useState } from 'react';
import { Pizza, Search } from 'lucide-react';
import { Footer } from '../components/Footer';
import { LineReveal } from '../components/LineReveal';
import { OrderStatusCard } from '../components/OrderStatusCard';
import { api } from '../utils/api';
import { DAY_NAMES, fmtTime } from '../utils/orders';

const SAVED_KEY = 'pp_order_id';
const POLL_MS = 8000;

// Public "where's my slice?" page. If this device has an in-flight order
// (saved on submit by the order page), show its live status; otherwise show
// the kitchen's open/closed state and point people at ordering.
export function StatusPage({ nav }) {
  const [trackedId, setTrackedId] = useState(() => localStorage.getItem(SAVED_KEY));
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem(SAVED_KEY)));
  const [store, setStore] = useState(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [lookupError, setLookupError] = useState('');

  useEffect(() => { window.scrollTo(0, 0); }, []);

  useEffect(() => {
    let cancelled = false;
    api('/api/store')
      .then((d) => { if (!cancelled) setStore(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Fetch the tracked order, then poll while it's still cooking. Keyed on the
  // id (not the order object) so a poll result doesn't re-arm the interval.
  const settled = order && (order.status === 'done' || order.status === 'cancelled');
  useEffect(() => {
    if (!trackedId || settled) { setLoading(false); return undefined; }
    let cancelled = false;
    const fetchOrder = () =>
      api(`/api/orders?id=${encodeURIComponent(trackedId)}`)
        .then((d) => { if (!cancelled) setOrder(d.order); })
        .catch((err) => {
          // Forget the order only when the server says it's gone — a network
          // blip or a 5xx mustn't wipe live tracking mid-bake.
          if (!cancelled && err.status === 404) {
            localStorage.removeItem(SAVED_KEY);
            setTrackedId(null);
            setOrder(null);
          }
        });
    fetchOrder().finally(() => { if (!cancelled) setLoading(false); });
    const t = setInterval(fetchOrder, POLL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [trackedId, settled]);

  const lookup = async (e) => {
    e.preventDefault();
    if (query.trim().length < 2 || searching) return;
    setSearching(true);
    setLookupError('');
    try {
      const { order: found } = await api(`/api/orders?find=${encodeURIComponent(query.trim())}`);
      localStorage.setItem(SAVED_KEY, found.id);
      setOrder(found);
      setTrackedId(found.id);
      setQuery('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setLookupError(err.message);
    } finally {
      setSearching(false);
    }
  };

  const forget = () => {
    localStorage.removeItem(SAVED_KEY);
    setTrackedId(null);
    setOrder(null);
    setLookupError('');
  };

  const newOrder = () => {
    localStorage.removeItem(SAVED_KEY);
    setTrackedId(null);
    setOrder(null);
    nav('order');
  };

  const lookupForm = (
    <form className="status-lookup" onSubmit={lookup}>
      <label className="order-field status-lookup-field">
        <span>Pickup code or name</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. F4WS or Sam"
          maxLength={60}
        />
      </label>
      <button className="btn-primary status-lookup-btn" type="submit" disabled={query.trim().length < 2 || searching}>
        {searching ? 'Searching…' : <>Find my order <Search size={13} /></>}
      </button>
      {lookupError && <div className="order-error status-lookup-error">{lookupError}</div>}
    </form>
  );

  const live = order && order.status !== 'done' && order.status !== 'cancelled';

  return (
    <div className="order-page">
      <div className="order-head">
        <div className="section-label">Slice Status</div>
        <LineReveal as="h1" className="order-title" text="Where's my slice?" />
        {live ? (
          <p className="order-sub status-live">
            <span className="pulse-dot" aria-hidden="true" /> Tracking live · updates every few seconds
          </p>
        ) : (
          <p className="order-sub">Track your order from received to ready for pickup</p>
        )}
      </div>

      {loading ? null : order ? (
        <>
          <OrderStatusCard order={order} onNewOrder={newOrder} />
          <div className="confirm-wrap status-not-you">
            <button className="text-link-btn" onClick={forget}>
              Not your order? Look up a different one
            </button>
          </div>
        </>
      ) : (
        <div className="confirm-wrap">
          <div className="confirm-card">
            <div className="order-closed-icon" aria-hidden="true"><Pizza size={20} /></div>
            <h2 className="confirm-title">Let&apos;s find <em>your slices.</em></h2>
            <p className="order-closed-sub">
              Enter the pickup code from your confirmation — or just the name the order is
              under — and we&apos;ll track it live from &ldquo;received&rdquo; to &ldquo;ready for pickup.&rdquo;
            </p>
            {lookupForm}
            <div className="confirm-fineprint">
              {store?.open
                ? 'No order yet? The kitchen is taking orders right now — '
                : store?.mode === 'auto' && store?.hours
                  ? `No order yet? Orders open ${DAY_NAMES[store.hours.day]}s, ${fmtTime(store.hours.start)}–${fmtTime(store.hours.end)} (ET) — `
                  : 'No order yet? '}
              <button className="status-order-link" onClick={() => nav('order')}>order here</button>.
            </div>
          </div>
        </div>
      )}

      <Footer nav={nav} />
    </div>
  );
}
