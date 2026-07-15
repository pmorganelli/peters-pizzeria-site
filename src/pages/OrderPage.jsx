import { useEffect, useState } from 'react';
import { ArrowDown, ArrowRight, Clock, Minus, Plus, X } from 'lucide-react';
import { Footer } from '../components/Footer';
import { LineReveal } from '../components/LineReveal';
import { OrderStatusCard } from '../components/OrderStatusCard';
import { MENU_DATA } from '../data/menu';
import { api } from '../utils/api';
import { DAY_NAMES, displayName, fmtMoney, fmtTime, parsePriceCents } from '../utils/orders';

const SAVED_KEY = 'pp_order_id';
const CART_KEY = 'pp_cart:v2';
const CART_KEY_UNVERSIONED = 'pp_cart2'; // pre-versioning name for the same shape
const LEGACY_CART_KEY = 'pp_cart';
const WHO_KEY = 'pp_who:v1';

const readJSON = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const POLL_MS = 8000;

const PIZZA_CATEGORY = MENU_DATA[0].category;
const ADDON_CATEGORY = MENU_DATA[1].category;
const ADDON_ITEMS = MENU_DATA[1].items;
// Add-ons aren't standalone order rows — they attach to slices per unit
const ORDERABLE_SECTIONS = MENU_DATA.filter((s) => s.category !== ADDON_CATEGORY);

// Cart model: item name → one entry per unit, each entry listing that unit's
// add-on names — so "one cheese slice with burrata, one plain" is two units.
// Migrates the old { name: qty } shape from before add-ons were per-slice.
function readCart() {
  const v2 = readJSON(CART_KEY, null) ?? readJSON(CART_KEY_UNVERSIONED, null);
  if (v2 && typeof v2 === 'object') return v2;
  const legacy = readJSON(LEGACY_CART_KEY, null);
  if (!legacy || typeof legacy !== 'object') return {};
  const units = {};
  for (const [name, qty] of Object.entries(legacy)) {
    if (Number.isInteger(qty) && qty > 0) units[name] = Array.from({ length: Math.min(qty, 30) }, () => []);
  }
  return units;
}

function Stepper({ qty, onChange }) {
  if (!qty) {
    return (
      <button type="button" className="order-add-btn" onClick={() => onChange(1)}>
        <Plus size={12} /> Add
      </button>
    );
  }
  return (
    <div className="order-stepper">
      <button type="button" aria-label="Remove one" onClick={() => onChange(qty - 1)}><Minus size={13} /></button>
      <span>{qty}</span>
      <button type="button" aria-label="Add one" onClick={() => onChange(Math.min(30, qty + 1))}><Plus size={13} /></button>
    </div>
  );
}

function MenuList({ cart, unavailable, setQty, toggleAddon }) {
  return (
    <div className="order-menu">
      {ORDERABLE_SECTIONS.map((section) => (
        <div key={section.category}>
          <div className="order-cat">{section.category}</div>
          {section.items.map((item) => {
            const soldOut = unavailable.has(item.name);
            const units = cart[item.name] ?? [];
            const showAddons = section.category === PIZZA_CATEGORY && !soldOut && units.length > 0;
            return (
              <div key={item.name}>
                <div className={`order-row${soldOut ? ' order-row-soldout' : ''}${showAddons ? ' order-row-open' : ''}`}>
                  <div className="order-row-text">
                    <div className="order-row-name">{item.name}</div>
                    <div className="order-row-desc">{item.desc}</div>
                  </div>
                  <div className="order-row-price">{item.price}</div>
                  {soldOut
                    ? <span className="order-soldout-chip">Sold out</span>
                    : <Stepper qty={units.length} onChange={(q) => setQty(item.name, q)} />}
                </div>
                {showAddons && (
                  <div className="addon-units">
                    {units.map((u, i) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <div key={i} className="addon-unit">
                        <span className="addon-unit-label">{units.length > 1 ? `Slice ${i + 1}` : 'Add-ons'}</span>
                        {ADDON_ITEMS.map((a) => {
                          const off = unavailable.has(a.name);
                          const on = u.includes(a.name);
                          return (
                            <button
                              key={a.name}
                              type="button"
                              disabled={off}
                              className={`addon-chip${on ? ' addon-chip-on' : ''}${off ? ' addon-chip-86' : ''}`}
                              aria-pressed={on}
                              aria-label={`${displayName(a.name)} for ${item.name} ${units.length > 1 ? `slice ${i + 1}` : ''}`}
                              onClick={() => toggleAddon(item.name, i, a.name)}
                            >
                              {displayName(a.name)} · {off ? 'sold out' : a.price}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function OrderSummaryPanel({
  cartLines, removedFromCart, totalCents, removeLine,
  name, setName, contact, setContact, notes, setNotes,
  error, canPlace, placing, place,
}) {
  return (
    <div className="order-summary">
      <div className="order-summary-label">Your order</div>
      {cartLines.length === 0 ? (
        <div className="order-empty">Nothing here yet — add something from the menu.</div>
      ) : (
        <div>
          {cartLines.map((l) => (
            <div key={l.key}>
              <div className="order-line">
                <button type="button"
                  className="order-line-x"
                  aria-label={`Remove ${l.name}${l.addons.length ? ` with ${l.addons.map(displayName).join(', ')}` : ''}`}
                  onClick={() => removeLine(l)}
                >
                  <X size={11} />
                </button>
                <span className="order-line-name">{l.qty} × {displayName(l.name)}</span>
                <span>{fmtMoney(l.unitCents * l.qty)}</span>
              </div>
              {l.addons.length > 0 && (
                <div className="order-line-addons">{l.addons.map((a) => `+ ${displayName(a)}`).join('  ·  ')}</div>
              )}
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

      <button type="button"
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
          <button type="button"
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
  const [cart, setCart] = useState(readCart);
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

  // Live status while the order is open. Depend on id/status rather than the
  // order object — every poll builds a fresh object, and keying the effect on
  // it would tear down and re-arm the interval on each response.
  const orderId = order?.id;
  const orderSettled = !order || order.status === 'done' || order.status === 'cancelled';
  useEffect(() => {
    if (orderSettled) return undefined;
    // The cancelled flag covers the fetch in flight when the interval clears —
    // without it, a late response resurrects an order the user just dismissed.
    let cancelled = false;
    const t = setInterval(() => {
      api(`/api/orders?id=${encodeURIComponent(orderId)}`)
        .then((d) => { if (!cancelled) setOrder(d.order); })
        .catch((err) => {
          // Forget the order only when the server says it's gone — a network
          // blip or a 5xx mustn't wipe live tracking mid-bake.
          if (!cancelled && err.status === 404) {
            localStorage.removeItem(SAVED_KEY);
            setOrder(null);
          }
        });
    }, POLL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [orderId, orderSettled]);

  // Grow with plain units, shrink from the end (a removed unit takes its add-ons with it)
  const setQty = (itemName, qty) =>
    setCart((c) => {
      const units = (c[itemName] ?? []).slice(0, qty);
      while (units.length < qty) units.push([]);
      const next = { ...c };
      if (qty > 0) next[itemName] = units; else delete next[itemName];
      return next;
    });

  const toggleAddon = (itemName, unitIdx, addonName) =>
    setCart((c) => ({
      ...c,
      [itemName]: (c[itemName] ?? []).map((u, i) => {
        if (i !== unitIdx) return u;
        if (u.includes(addonName)) return u.filter((a) => a !== addonName);
        // keep add-ons in menu order so identical sets always group together
        return ADDON_ITEMS.flatMap((a) => (u.includes(a.name) || a.name === addonName) ? [a.name] : []);
      }),
    }));

  const unavailable = new Set(store?.unavailable || []);

  // Group each item's units by identical add-on sets → the order lines shown
  // in the summary and sent to the API. Sold-out add-ons are stripped.
  const cartLines = [];
  const strippedAddons = new Set();
  for (const section of ORDERABLE_SECTIONS) {
    for (const item of section.items) {
      const units = cart[item.name];
      if (!units?.length || unavailable.has(item.name)) continue;
      const groups = new Map();
      for (const u of units) {
        const kept = u.filter((a) => {
          if (unavailable.has(a)) { strippedAddons.add(a); return false; }
          return true;
        });
        const key = kept.join('|');
        const g = groups.get(key) ?? { addons: kept, qty: 0 };
        g.qty += 1;
        groups.set(key, g);
      }
      for (const [key, g] of groups) {
        const addonCents = g.addons.reduce(
          (sum, a) => sum + parsePriceCents(ADDON_ITEMS.find((x) => x.name === a)?.price ?? '$0'), 0);
        cartLines.push({
          name: item.name, qty: g.qty, addons: g.addons,
          unitCents: parsePriceCents(item.price) + addonCents,
          key: `${item.name}|${key}`,
        });
      }
    }
  }
  const removeLine = (line) =>
    setCart((c) => {
      const key = line.addons.join('|');
      const remaining = (c[line.name] ?? []).filter(
        (u) => u.filter((a) => !unavailable.has(a)).join('|') !== key);
      const next = { ...c };
      if (remaining.length) next[line.name] = remaining; else delete next[line.name];
      return next;
    });

  // Items that were in the cart (possibly from a previous visit) but sold out since
  const removedFromCart = MENU_DATA.flatMap((s) =>
    s.items.flatMap((it) => (cart[it.name]?.length && unavailable.has(it.name)) ? [it.name] : [])
  ).concat([...strippedAddons]);
  const totalCents = cartLines.reduce((sum, l) => sum + l.unitCents * l.qty, 0);
  const canPlace = cartLines.length > 0 && name.trim().length >= 2 && !placing;

  const place = async () => {
    // The API caps orders at 40 lines; grouping by add-on set can genuinely
    // exceed that, and the server's generic 400 would be misleading here.
    if (cartLines.length > 40) {
      setError("That's a lot of different combinations for one order — please split it into two.");
      return;
    }
    setPlacing(true);
    setError('');
    try {
      const { order: created } = await api('/api/orders', {
        method: 'POST',
        body: {
          name, contact, notes,
          items: cartLines.map(({ name: n, qty, addons }) =>
            addons.length ? { name: n, qty, addons } : { name: n, qty }),
        },
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
          <MenuList cart={cart} unavailable={unavailable} setQty={setQty} toggleAddon={toggleAddon} />
          <OrderSummaryPanel
            cartLines={cartLines} removedFromCart={removedFromCart} totalCents={totalCents} removeLine={removeLine}
            name={name} setName={setName} contact={contact} setContact={setContact} notes={notes} setNotes={setNotes}
            error={error} canPlace={canPlace} placing={placing} place={place}
          />
        </div>
      )}

      {!order && !loadingSaved && store?.open && cartLines.length > 0 && (
        <button type="button"
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
