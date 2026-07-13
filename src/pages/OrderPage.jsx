import { useEffect, useState } from 'react';
import { ArrowDown, ArrowRight, Clock, Minus, Plus, X } from 'lucide-react';
import { Footer } from '../components/Footer';
import { LineReveal } from '../components/LineReveal';
import { OrderStatusCard } from '../components/OrderStatusCard';
import { MENU_DATA } from '../data/menu';
import { api } from '../utils/api';
import { DAY_NAMES, displayName, fmtMoney, fmtTime, parsePriceCents } from '../utils/orders';

const SAVED_KEY = 'pp_order_id';
const CART_KEY = 'pp_cart';
const WHO_KEY = 'pp_who';

const readJSON = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const POLL_MS = 8000;

function Stepper({ qty, onChange }) {
  if (!qty) {
    return (
      <button className="order-add-btn" onClick={() => onChange(1)}>
        <Plus size={12} /> Add
      </button>
    );
  }
  return (
    <div className="order-stepper">
      <button aria-label="Remove one" onClick={() => onChange(qty - 1)}><Minus size={13} /></button>
      <span>{qty}</span>
      <button aria-label="Add one" onClick={() => onChange(Math.min(30, qty + 1))}><Plus size={13} /></button>
    </div>
  );
}

function ClosedCard({ store, nav }) {
  return (
    <div className="confirm-wrap">
      <div className="confirm-card order-closed">
        <div className="order-closed-icon" aria-hidden="true"><Clock size={20} /></div>
        <h2 className="confirm-title">We&apos;re closed <em>right now.</em></h2>
        {store.mode === 'auto' ? (
          <p className="order-closed-sub">
            Orders open {DAY_NAMES[store.hours.day]}s, {fmtTime(store.hours.start)}–{fmtTime(store.hours.end)} (ET).
            Come back then — your cart will be waiting.
          </p>
        ) : (
          <p className="order-closed-sub">
            We&apos;ll be back soon — follow{' '}
            <a href="https://instagram.com/peterspizzeria_" target="_blank" rel="noreferrer">@peterspizzeria_</a>{' '}
            for the next drop.
          </p>
        )}
        <div className="confirm-actions">
          <button
            className="btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            onClick={() => nav('menu')}
          >
            Browse the menu <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function OrderPage({ nav }) {
  // Cart and pickup identity survive navigation and refreshes
  const [cart, setCart] = useState(() => readJSON(CART_KEY, {}));
  const [name, setName] = useState(() => readJSON(WHO_KEY, {}).name || '');
  const [contact, setContact] = useState(() => readJSON(WHO_KEY, {}).contact || '');
  const [notes, setNotes] = useState('');
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);
  const [loadingSaved, setLoadingSaved] = useState(() => Boolean(localStorage.getItem(SAVED_KEY)));
  const [store, setStore] = useState(null);

  // Open/closed status. If the check itself fails, fail open — the server
  // still enforces hours on submission.
  useEffect(() => {
    let cancelled = false;
    api('/api/store')
      .then((d) => { if (!cancelled) setStore(d); })
      .catch(() => { if (!cancelled) setStore({ open: true, mode: 'open' }); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { window.scrollTo(0, 0); }, [order?.id]);
  useEffect(() => { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }, [cart]);

  // Restore an in-flight order across refreshes
  useEffect(() => {
    const saved = localStorage.getItem(SAVED_KEY);
    if (!saved) return;
    let cancelled = false;
    api(`/api/orders?id=${encodeURIComponent(saved)}`)
      .then((d) => { if (!cancelled) setOrder(d.order); })
      // Forget only when the server says it's gone; keep it through blips
      .catch((err) => { if (!cancelled && err.status === 404) localStorage.removeItem(SAVED_KEY); })
      .finally(() => { if (!cancelled) setLoadingSaved(false); });
    return () => { cancelled = true; };
  }, []);

  // Live status while the order is open
  useEffect(() => {
    if (!order || order.status === 'done' || order.status === 'cancelled') return undefined;
    const t = setInterval(() => {
      api(`/api/orders?id=${encodeURIComponent(order.id)}`)
        .then((d) => setOrder(d.order))
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(t);
  }, [order]);

  const setQty = (itemName, qty) =>
    setCart((c) => {
      const next = { ...c };
      if (qty > 0) next[itemName] = qty; else delete next[itemName];
      return next;
    });

  const unavailable = new Set(store?.unavailable || []);
  const cartLines = MENU_DATA.flatMap((section) =>
    section.items
      .filter((it) => cart[it.name] && !unavailable.has(it.name))
      .map((it) => ({ name: it.name, qty: cart[it.name], priceCents: parsePriceCents(it.price) }))
  );
  // Items that were in the cart (possibly from a previous visit) but sold out since
  const removedFromCart = MENU_DATA.flatMap((s) => s.items)
    .filter((it) => cart[it.name] && unavailable.has(it.name))
    .map((it) => it.name);
  const totalCents = cartLines.reduce((sum, l) => sum + l.priceCents * l.qty, 0);
  const canPlace = cartLines.length > 0 && name.trim().length >= 2 && !placing;

  const place = async () => {
    setPlacing(true);
    setError('');
    try {
      const { order: created } = await api('/api/orders', {
        method: 'POST',
        body: { name, contact, notes, items: cartLines.map(({ name: n, qty }) => ({ name: n, qty })) },
      });
      localStorage.setItem(SAVED_KEY, created.id);
      localStorage.setItem(WHO_KEY, JSON.stringify({ name, contact }));
      setOrder(created);
      setCart({});
      setNotes('');
    } catch (e) {
      setError(e.message);
      // The store may have closed or an item sold out while the cart was built
      if (e.status === 403) setStore((s) => ({ ...(s || { mode: 'closed', hours: null }), open: false }));
      else if (e.status === 400) api('/api/store').then(setStore).catch(() => {});
    } finally {
      setPlacing(false);
    }
  };

  const newOrder = () => {
    localStorage.removeItem(SAVED_KEY);
    setOrder(null);
  };

  return (
    <div className="order-page">
      <div className="order-head">
        <div className="section-label">Order</div>
        <LineReveal as="h1" className="order-title" text="Order ahead. Skip the line." />
        <p className="order-sub">Saturdays 7pm til sellout · Pay via Venmo or Zelle at pickup</p>
      </div>

      {loadingSaved || store === null ? null : order ? (
        <OrderStatusCard order={order} onNewOrder={newOrder} />
      ) : !store.open ? (
        <ClosedCard store={store} nav={nav} />
      ) : (
        <div className="order-grid">
          <div className="order-menu">
            {MENU_DATA.map((section) => (
              <div key={section.category}>
                <div className="order-cat">{section.category}</div>
                {section.items.map((item) => {
                  const soldOut = unavailable.has(item.name);
                  return (
                    <div key={item.name} className={`order-row${soldOut ? ' order-row-soldout' : ''}`}>
                      <div className="order-row-text">
                        <div className="order-row-name">{item.name}</div>
                        <div className="order-row-desc">{item.desc}</div>
                      </div>
                      <div className="order-row-price">{item.price}</div>
                      {soldOut
                        ? <span className="order-soldout-chip">Sold out</span>
                        : <Stepper qty={cart[item.name] || 0} onChange={(q) => setQty(item.name, q)} />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="order-summary">
            <div className="order-summary-label">Your order</div>
            {cartLines.length === 0 ? (
              <div className="order-empty">Nothing here yet — add something from the menu.</div>
            ) : (
              <div>
                {cartLines.map((l) => (
                  <div key={l.name} className="order-line">
                    <button className="order-line-x" aria-label={`Remove ${l.name}`} onClick={() => setQty(l.name, 0)}>
                      <X size={11} />
                    </button>
                    <span className="order-line-name">{l.qty} × {displayName(l.name)}</span>
                    <span>{fmtMoney(l.priceCents * l.qty)}</span>
                  </div>
                ))}
                <div className="order-line order-total">
                  <span>Total</span>
                  <span>{fmtMoney(totalCents)}</span>
                </div>
              </div>
            )}

            {removedFromCart.length > 0 && (
              <div className="order-soldout-note">
                Sold out today: {removedFromCart.map(displayName).join(', ')} — we left {removedFromCart.length === 1 ? 'it' : 'them'} out of your total.
              </div>
            )}

            <label className="order-field">
              <span>Name *</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Who's picking up?" maxLength={60} />
            </label>
            <label className="order-field">
              <span>Phone or Instagram (optional)</span>
              <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="So we can reach you" maxLength={80} />
            </label>
            <label className="order-field">
              <span>Notes (optional)</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Allergies, requests…" maxLength={280} />
            </label>

            {error && <div className="order-error">{error}</div>}

            <button
              className="btn-primary order-place"
              disabled={!canPlace}
              onClick={place}
            >
              {placing ? 'Placing…'
                : cartLines.length === 0 ? 'Add something first'
                : name.trim().length < 2 ? 'Add your name above'
                : `Place order · ${fmtMoney(totalCents)}`}
              {canPlace && <ArrowRight size={14} />}
            </button>
            <div className="order-fineprint">
              No payment needed now — Venmo or Zelle at pickup. We&apos;ll fire your slices in order.
            </div>
          </div>
        </div>
      )}

      {!order && !loadingSaved && store?.open && cartLines.length > 0 && (
        <button
          className="order-mobilebar"
          onClick={() => document.querySelector('.order-summary')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          <span>{cartLines.reduce((s, l) => s + l.qty, 0)} item{cartLines.reduce((s, l) => s + l.qty, 0) === 1 ? '' : 's'}</span>
          <span className="order-mobilebar-cta">Review order · {fmtMoney(totalCents)} <ArrowDown size={13} /></span>
        </button>
      )}

      <Footer nav={nav} />
    </div>
  );
}
