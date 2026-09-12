import { useEffect, useState } from 'react';
import { Pizza, Search } from 'lucide-react';
import { Footer } from '../components/Footer';
import { LineReveal } from '../components/LineReveal';
import { OrderStatusCard } from '../components/OrderStatusCard';
import { api } from '../utils/api';
import { STATUS_LABELS, agoLabel, fmtMoney, formatOrderItems } from '../utils/orders';
import { readStored, writeStored, removeStored } from '../utils/storage';

const SAVED_KEY = 'pp_order_id';
const POLL_MS = 8000;

// Public "where's my slice?" page. If this device has an in-flight order
// (saved on submit by the order page), show its live status; otherwise show
// the kitchen's open/closed state and point people at ordering.
export function StatusPage({ nav, isAdmin }) {
  const [trackedId, setTrackedId] = useState(() => readStored(SAVED_KEY));
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(readStored(SAVED_KEY)));
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [lookupError, setLookupError] = useState('');
  // Set when a name turned up more than one live order — the customer picks
  // which is theirs rather than the server guessing. Null the rest of the time.
  const [matches, setMatches] = useState(null);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  // Fetch the tracked order, then poll while it's still cooking. Keyed on the
  // id (not the order object) so a poll result doesn't re-arm the interval.
  const settled = order && (order.status === 'done' || order.status === 'cancelled');
  useEffect(() => {
    // No setLoading(false) here on purpose. `loading` is only ever set true by
    // the useState initializer, and that happens exactly when SAVED_KEY exists
    // — which means trackedId is truthy and `order` is still null, so the
    // first run always takes the fetch path below and clears it in .finally().
    // By the time `settled` can be true, that has already run. The call this
    // replaces could never change the value; it just cost a render pass.
    if (!trackedId || settled) return undefined;
    let cancelled = false;
    let issued = 0;
    let applied = 0;
    const fetchOrder = () => {
      const sequence = ++issued;
      return api(`/api/orders?id=${encodeURIComponent(trackedId)}`)
        .then((d) => {
          if (!cancelled && sequence > applied) {
            applied = sequence;
            setOrder(d.order);
          }
        })
        .catch((err) => {
          // Forget the order only when the server says it's gone — a network
          // blip or a 5xx mustn't wipe live tracking mid-bake.
          if (!cancelled && sequence > applied && err.status === 404) {
            applied = sequence;
            removeStored(SAVED_KEY);
            setTrackedId(null);
            setOrder(null);
          }
        });
    };
    // Don't poll at a tab nobody is looking at, and refresh the moment someone
    // looks again. Both halves matter here: every customer of the night has
    // this page open on a phone that spends the evening locked in a pocket, so
    // the skipped requests are most of the requests — and the refresh on the
    // way back is why someone unlocking at the window sees "Ready" straight
    // away instead of up to 8 seconds later, which is the one moment this page
    // exists for.
    //
    // The interval keeps ticking while hidden and simply does no work, rather
    // than being torn down and rebuilt around visibility (which is what the
    // community wall does). A timer created lazily inside a closure is a timer
    // static analysis can't prove gets cleared — react-doctor's
    // effect-needs-cleanup flags exactly that shape — and browsers throttle
    // background intervals to about once a minute anyway, so the idle tick
    // costs nothing while the network call it guards is the real expense.
    const onVisibility = () => { if (!document.hidden) fetchOrder(); };
    const timer = setInterval(() => { if (!document.hidden) fetchOrder(); }, POLL_MS);
    fetchOrder().finally(() => { if (!cancelled) setLoading(false); });
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [trackedId, settled]);

  // One field for both a pickup code and a name — the server tries the code
  // first and falls back to an exact name match, so there's no mode to pick
  // and no guessing here about which one was typed. Two characters is the
  // floor the name path enforces server-side.
  const lookup = async (e) => {
    e.preventDefault();
    const term = query.trim().replace(/^#/, '');
    if (term.length < 2 || searching) return;
    setSearching(true);
    setLookupError('');
    setMatches(null);
    try {
      const found = await api(`/api/orders?find=${encodeURIComponent(term)}`);
      // Several live orders under one name: the customer says which is theirs.
      if (found.matches) {
        setMatches(found.matches);
        return;
      }
      writeStored(SAVED_KEY, found.order.id);
      setOrder(found.order);
      setTrackedId(found.order.id);
      setQuery('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setLookupError(err.message);
    } finally {
      setSearching(false);
    }
  };

  // Picking out of a tie. The summaries carry no pickup code, so the real
  // order still has to be fetched — done by the polling effect, which the
  // trackedId change below arms. `loading` covers the gap so the lookup form
  // doesn't flash back up in between.
  const pickMatch = (id) => {
    writeStored(SAVED_KEY, id);
    setMatches(null);
    setQuery('');
    setLoading(true);
    setTrackedId(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const forget = () => {
    removeStored(SAVED_KEY);
    setTrackedId(null);
    setOrder(null);
    setLookupError('');
    setMatches(null);
  };

  // Dismisses the tracked order. It used to hand you straight to /order;
  // that page is staff-only now, so for everyone else this drops back to the
  // lookup form — which is the only thing a customer can act on here.
  const newOrder = () => {
    removeStored(SAVED_KEY);
    setTrackedId(null);
    setOrder(null);
    if (isAdmin === true) nav('order');
  };

  const lookupForm = (
    <form className="status-lookup" onSubmit={lookup}>
      <label className="order-field status-lookup-field">
        <span>Name</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="the name you gave us"
          maxLength={60}
        />
      </label>
      <button className="btn-primary status-lookup-btn" type="submit" disabled={query.trim().replace(/^#/, '').length < 2 || searching}>
        {searching ? 'Searching…' : <>Find my order <Search size={13} /></>}
      </button>
      {lookupError && <div className="order-error status-lookup-error">{lookupError}</div>}
      {matches && (
        <div className="status-matches">
          <div className="status-matches-label">
            More than one order under that name — which one is yours?
          </div>
          {matches.map((m) => (
            <button type="button" key={m.id} className="status-match" onClick={() => pickMatch(m.id)}>
              <span className="status-match-items">{formatOrderItems(m.items)}</span>
              <span className="status-match-meta">
                {STATUS_LABELS[m.status]} · {agoLabel(m.createdAt)} · {fmtMoney(m.totalCents)}
              </span>
            </button>
          ))}
        </div>
      )}
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
          <OrderStatusCard order={order} onNewOrder={newOrder} nav={nav} />
          <div className="confirm-wrap status-not-you">
            <button type="button" className="text-link-btn" onClick={forget}>
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
              Enter the name you gave us at the window.
              We&apos;ll track it for you live until it&apos;s ready for pickup!
            </p>
            {lookupForm}
            {/* Staff shortcut only. There used to be a line here about opening
                hours and where to find us; it said nothing the rest of the
                page doesn't, and the card reads better without it. */}
            {isAdmin === true && (
              <div className="confirm-fineprint">
                <button type="button" className="status-order-link" onClick={() => nav('order')}>Take an order</button>
              </div>
            )}
          </div>
        </div>
      )}

      <Footer nav={nav} />
    </div>
  );
}
