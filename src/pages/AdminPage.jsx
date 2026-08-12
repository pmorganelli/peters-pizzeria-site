import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, Eye, EyeOff, Flame, LogOut, RotateCcw, Store, Trash2, UtensilsCrossed, X } from 'lucide-react';
import { Footer } from '../components/Footer';
import { MENU_DATA } from '../data/menu';
import { api } from '../utils/api';
import { DAY_NAMES, displayName, fmtMoney, fmtTime, ageLabel, agoLabel, orderLineKey } from '../utils/orders';

const POLL_MS = 5000;
const PIZZA_CATEGORY = MENU_DATA[0].category;
const ADDON_CATEGORY = MENU_DATA[1].category;
const BASE_TITLE = document.title;

const COLUMNS = [
  { status: 'new', title: 'New', action: 'Start firing', next: 'firing', Icon: Flame },
  { status: 'firing', title: 'In the oven', action: 'Mark ready', next: 'ready', Icon: Check },
  { status: 'ready', title: 'Ready for pickup', action: 'Picked up', next: 'done', Icon: Check },
];

function Login({ onSuccess }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      // The server sets an HttpOnly cookie on success — there's no token for
      // this page to hold onto, just a yes/no.
      await api('/api/login', { method: 'POST', body: { password } });
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-login-wrap">
      <form className="admin-login" onSubmit={submit}>
        <div className="section-label" style={{ color: 'var(--gold)' }}>Staff only</div>
        <h1 className="admin-login-title">Order <em>board.</em></h1>
        <label className="order-field admin-field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error && <div className="order-error">{error}</div>}
        <button className="btn-primary" type="submit" disabled={busy || !password}>
          {busy ? 'Checking…' : 'Log in'}
        </button>
      </form>
    </div>
  );
}

function OrderCard({ order, column, onAdvance, onCancel }) {
  return (
    <div className="oc">
      <div className="oc-head">
        <span className="oc-code">#{order.code}</span>
        <span className="oc-name">{order.name}</span>
        <span className="oc-age">{ageLabel(order.createdAt)}</span>
      </div>
      <div className="oc-items">
        {order.items.map((it) => (
          <div key={orderLineKey(it)} className={`oc-item${it.category === PIZZA_CATEGORY ? ' oc-item-pizza' : ''}`}>
            <span className="oc-qty">{it.qty}×</span> {it.category === ADDON_CATEGORY ? `+ ${displayName(it.name)}` : it.name}
            {it.addons?.length > 0 && (
              <span className="oc-item-addons"> · + {it.addons.map((a) => displayName(a.name)).join(', + ')}</span>
            )}
          </div>
        ))}
      </div>
      {order.notes && <div className="oc-notes">“{order.notes}”</div>}
      <div className="oc-meta">
        <span>{fmtMoney(order.totalCents)}</span>
        {order.contact && <span className="oc-contact">{order.contact}</span>}
      </div>
      <div className="oc-actions">
        <button type="button" className="oc-advance" onClick={() => onAdvance(order, column.next)}>
          <column.Icon size={12} /> {column.action}
        </button>
        {column.status === 'new' && (
          <button type="button" className="oc-cancel" aria-label={`Cancel order ${order.code}`} onClick={() => onCancel(order)}>
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

function StorePanel({ storeInfo, savingStore, draft, setDraft, saveStore, currentHours }) {
  return (
    <div className="store-panel">
      <div className="store-status">
        <div className="store-panel-label"><Store size={13} /> Storefront</div>
        <div className="store-status-row">
          <span className={`store-pill ${storeInfo.open ? 'store-pill-open' : 'store-pill-closed'}`}>
            {storeInfo.open ? 'Open' : 'Closed'}
          </span>
          <span className="store-mode-desc">
            {storeInfo.mode === 'open' ? 'Manual override — taking orders'
              : storeInfo.mode === 'closed' ? 'Manual override — not taking orders'
              : `On schedule: ${DAY_NAMES[storeInfo.hours.day]}s, ${fmtTime(storeInfo.hours.start)}–${fmtTime(storeInfo.hours.end)} ET`}
          </span>
        </div>
      </div>
      <div className="store-controls">
        <div className="store-modes" role="group" aria-label="Store mode">
          <button type="button"
            className={storeInfo.mode === 'open' ? 'active' : ''}
            disabled={savingStore}
            onClick={() => saveStore({ mode: 'open', hours: currentHours() })}
          >
            Open now
          </button>
          <button type="button"
            className={storeInfo.mode === 'closed' ? 'active' : ''}
            disabled={savingStore}
            onClick={() => saveStore({ mode: 'closed', hours: currentHours() })}
          >
            Close
          </button>
          <button type="button"
            className={storeInfo.mode === 'auto' ? 'active' : ''}
            disabled={savingStore}
            onClick={() => saveStore({ mode: 'auto', hours: currentHours() })}
          >
            Use schedule
          </button>
        </div>
        <div className="store-schedule">
          <select
            aria-label="Open day"
            value={draft.day}
            onChange={(e) => setDraft((d) => ({ ...d, day: e.target.value }))}
          >
            {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}s</option>)}
          </select>
          <input aria-label="Opens at" type="time" value={draft.start} onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))} />
          <span className="store-schedule-dash">–</span>
          <input aria-label="Closes at" type="time" value={draft.end} onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))} />
          <button type="button"
            className="store-save"
            disabled={savingStore}
            onClick={() => saveStore({ mode: storeInfo.mode, hours: currentHours() })}
          >
            Save times
          </button>
        </div>
      </div>
    </div>
  );
}

function AvailabilityPanel({ unavailableSet, savingStore, toggleItem }) {
  return (
    <div className="avail-panel">
      <div className="store-panel-label"><UtensilsCrossed size={13} /> Availability — tap to 86 an item</div>
      <div className="avail-groups">
        {MENU_DATA.map((section) => (
          <div key={section.category} className="avail-group">
            <div className="avail-group-title">{section.category}</div>
            <div className="avail-chips">
              {section.items.map((item) => {
                const off = unavailableSet.has(item.name);
                return (
                  <button type="button"
                    key={item.name}
                    className={`avail-chip${off ? ' avail-chip-off' : ''}`}
                    disabled={savingStore}
                    onClick={() => toggleItem(item.name)}
                    aria-pressed={off}
                    aria-label={`${item.name}: ${off ? 'sold out — tap to restore' : 'available — tap to mark sold out'}`}
                  >
                    {displayName(item.name)}
                    {off && <span className="avail-chip-tag">86&apos;d</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Board({ orders, advance, cancel }) {
  return (
    <div className="board">
      {COLUMNS.map((col) => {
        const list = orders.filter((o) => o.status === col.status);
        return (
          <div key={col.status} className="board-col">
            <div className="board-col-title">{col.title} <span className="board-count">{list.length}</span></div>
            {list.length === 0 && <div className="board-empty">—</div>}
            {list.map((o) => (
              <OrderCard key={o.id} order={o} column={col} onAdvance={advance} onCancel={cancel} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

// Community wall moderation. Posts go live the moment they're uploaded, so
// this is the takedown surface: Hide is instant and reversible, Delete is
// permanent and also removes the stored image.
function SlicesPanel({ slices, busyId, armedId, hideSlice, removeSlice }) {
  if (!slices) return null;
  return (
    <div className="avail-panel">
      <div className="store-panel-label"><Camera size={13} /> Slice wall — {slices.length} posted</div>
      {slices.length === 0 ? (
        <div className="fire-empty">Nothing posted yet.</div>
      ) : (
        <div className="mod-grid">
          {slices.map((s) => (
            <div key={s.id} className={`mod-item${s.hidden ? ' mod-item-hidden' : ''}`}>
              <img src={s.url} alt={s.caption || `Posted by ${s.name || 'a customer'}`} loading="lazy" decoding="async" />
              <div className="mod-meta">
                <span className="mod-name">{s.name || 'anon'}</span>
                {/* Wall posts live 90 days, so this needs the days bucket that
                    ageLabel (built for same-day orders) doesn't have. */}
                <span className="mod-age">{agoLabel(s.createdAt)}</span>
              </div>
              {s.caption && <div className="mod-caption">{s.caption}</div>}
              <div className="mod-actions">
                <button type="button"
                  className="mod-btn"
                  disabled={busyId === s.id}
                  onClick={() => hideSlice(s, !s.hidden)}
                  aria-label={s.hidden ? 'Show this post on the wall' : 'Hide this post from the wall'}
                >
                  {s.hidden ? <><Eye size={12} /> Show</> : <><EyeOff size={12} /> Hide</>}
                </button>
                {/* Two taps rather than a confirm() dialog — deleting is
                    permanent, but a modal would block the whole board. */}
                <button type="button"
                  className={`mod-btn mod-btn-danger${armedId === s.id ? ' mod-btn-armed' : ''}`}
                  disabled={busyId === s.id}
                  onClick={() => removeSlice(s)}
                  aria-label={armedId === s.id ? 'Confirm permanent delete' : 'Delete this post permanently'}
                >
                  <Trash2 size={12} /> {armedId === s.id ? 'Tap to confirm' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FinishedList({ finished }) {
  return (
    <div className="admin-finished">
      <div className="board-col-title"><RotateCcw size={11} /> Finished ({finished.length})</div>
      {finished.map((o) => (
        <div key={o.id} className="finished-row">
          <span className="oc-code">#{o.code}</span>
          <span>{o.name}</span>
          <span className="finished-items">
            {o.items.map((it) => `${it.qty}× ${displayName(it.name)}${it.addons?.length ? ` (+ ${it.addons.map((a) => displayName(a.name)).join(', ')})` : ''}`).join(', ')}
          </span>
          <span>{fmtMoney(o.totalCents)}</span>
          <span className={`finished-status finished-${o.status}`}>{o.status === 'done' ? 'picked up' : 'cancelled'}</span>
        </div>
      ))}
    </div>
  );
}

export function AdminPage({ nav }) {
  // null = still checking with the server; the cookie is HttpOnly so this
  // page can't just read it out of storage to know if it's logged in.
  const [authed, setAuthed] = useState(null);
  const [orders, setOrders] = useState(null); // null = not loaded yet
  const [notice, setNotice] = useState('');
  const [storeInfo, setStoreInfo] = useState(null);
  const [draft, setDraft] = useState({ day: 6, start: '19:00', end: '20:30' });
  const [savingStore, setSavingStore] = useState(false);
  const [storeError, setStoreError] = useState('');
  const [slices, setSlices] = useState(null);
  const [sliceBusyId, setSliceBusyId] = useState(null);
  const [sliceArmedId, setSliceArmedId] = useState(null);
  const draftSeeded = useRef(false);
  // Bumped by every mutation (advance, 86 toggle, hours save). A poll snapshot
  // taken before a mutation is stale — applying it would visually revert the
  // change, and a re-tap would then persist the wrong state to the server.
  const epoch = useRef(0);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  useEffect(() => {
    api('/api/login').then((d) => setAuthed(d.authenticated)).catch(() => setAuthed(false));
  }, []);

  const logout = useCallback(async (message = '') => {
    // Only the server can clear an HttpOnly cookie — there's nothing for this
    // page to remove locally.
    try { await api('/api/login', { method: 'DELETE' }); } catch { /* clearing client state below is enough */ }
    setOrders(null);
    setNotice(message);
    setAuthed(false);
  }, []);

  const load = useCallback(async () => {
    if (!authed) return;
    const snapshot = epoch.current;
    try {
      const [{ orders: list }, status, wall] = await Promise.all([
        api('/api/orders'),
        api('/api/store'),
        // The wall is a secondary panel — if it errors, this leg resolves to
        // null instead of rejecting the whole poll. Sharing a Promise.all with
        // the orders fetch would otherwise let a bad slice record freeze the
        // kitchen board on stale data while the "live" dot keeps pulsing.
        api('/api/slices?admin=1').then((d) => d.slices).catch(() => null),
      ]);
      if (epoch.current !== snapshot) return; // a mutation superseded this poll
      setOrders(list);
      setStoreInfo(status);
      if (wall) setSlices(wall); // null = this poll's wall fetch failed; keep the last good list
      // Seed the schedule editor once; don't clobber in-progress edits on poll
      if (!draftSeeded.current && status.hours) {
        draftSeeded.current = true;
        setDraft({ day: status.hours.day, start: status.hours.start, end: status.hours.end });
      }
    } catch (err) {
      if (err.status === 401) logout('Session expired — log in again.');
    }
  }, [authed, logout]);

  const saveStore = async (next) => {
    setSavingStore(true);
    setStoreError('');
    epoch.current += 1; // invalidate polls in flight before this save
    try {
      const status = await api('/api/store', { method: 'PATCH', body: next });
      epoch.current += 1; // …and polls whose GET raced the PATCH server-side
      setStoreInfo(status);
    } catch (err) {
      if (err.status === 401) logout('Session expired — log in again.');
      else setStoreError(err.message || 'Could not save — try again.');
    } finally {
      setSavingStore(false);
    }
  };

  const currentHours = () => ({
    day: Number(draft.day),
    start: draft.start,
    end: draft.end,
    tz: 'America/New_York',
  });

  const toggleItem = (name) => {
    const next = new Set(storeInfo?.unavailable || []);
    if (next.has(name)) next.delete(name); else next.add(name);
    saveStore({ unavailable: [...next] });
  };

  const hideSlice = async (slice, hidden) => {
    setSliceBusyId(slice.id);
    setSliceArmedId(null);
    setStoreError('');
    epoch.current += 1;
    // Optimistic: hiding something offensive should feel instant.
    setSlices((list) => list.map((s) => (s.id === slice.id ? { ...s, hidden } : s)));
    try {
      await api(`/api/slices?id=${encodeURIComponent(slice.id)}`, { method: 'PATCH', body: { hidden } });
      epoch.current += 1;
    } catch (err) {
      if (err.status === 401) logout('Session expired — log in again.');
      else { setStoreError(err.message || 'Could not update that post.'); load(); }
    } finally {
      setSliceBusyId(null);
    }
  };

  const removeSlice = async (slice) => {
    // First tap arms, second tap deletes — the image is gone for good.
    if (sliceArmedId !== slice.id) { setSliceArmedId(slice.id); return; }
    setSliceArmedId(null);
    setSliceBusyId(slice.id);
    setStoreError('');
    epoch.current += 1;
    setSlices((list) => list.filter((s) => s.id !== slice.id));
    try {
      const { blobRemoved } = await api(`/api/slices?id=${encodeURIComponent(slice.id)}`, { method: 'DELETE' });
      epoch.current += 1;
      // The post is off the wall either way, but if the image file survived it
      // is still reachable at its Blob URL — worth saying out loud on a
      // takedown, since that's usually the whole point of the takedown.
      if (blobRemoved === false) {
        setStoreError('Post removed from the wall, but its image file could not be deleted — check the Blob store.');
      }
    } catch (err) {
      if (err.status === 401) logout('Session expired — log in again.');
      else { setStoreError(err.message || 'Could not delete that post.'); load(); }
    } finally {
      setSliceBusyId(null);
    }
  };

  useEffect(() => {
    if (!authed) return undefined;
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [authed, load]);

  const advance = async (order, status) => {
    // Optimistic update; the next poll reconciles
    epoch.current += 1; // a poll from before this tap must not snap the card back
    setOrders((list) => list.map((o) => (o.id === order.id ? { ...o, status } : o)));
    try {
      await api(`/api/orders?id=${encodeURIComponent(order.id)}`, { method: 'PATCH', body: { status } });
      epoch.current += 1;
    } catch {
      load();
    }
  };

  const cancel = (order) => {
    if (window.confirm(`Cancel order #${order.code} for ${order.name}?`)) advance(order, 'cancelled');
  };

  const unavailableSet = useMemo(() => new Set(storeInfo?.unavailable || []), [storeInfo]);

  const fireNext = useMemo(() => {
    if (!orders) return { pizzas: [], addons: [], waiting: 0, oldest: null };
    const queued = orders.filter((o) => o.status === 'new');
    const pizzas = new Map();
    const addons = new Map();
    for (const o of queued) {
      for (const it of o.items) {
        // Pizzas get the bright chips; everything else (add-ons, desserts,
        // sides) is dimmed — a dessert-only order must still show up here.
        if (it.category === PIZZA_CATEGORY) pizzas.set(it.name, (pizzas.get(it.name) || 0) + it.qty);
        else addons.set(it.name, (addons.get(it.name) || 0) + it.qty);
        // add-ons attached to slices (each applies once per slice in the line)
        for (const a of it.addons ?? []) addons.set(a.name, (addons.get(a.name) || 0) + it.qty);
      }
    }
    const sorted = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
    return {
      pizzas: sorted(pizzas),
      addons: sorted(addons),
      waiting: queued.length,
      oldest: queued.length ? Math.min(...queued.map((o) => o.createdAt)) : null,
    };
  }, [orders]);

  // Surface the queue in the tab title so new orders are visible from any tab
  useEffect(() => {
    const waiting = orders ? orders.filter((o) => o.status === 'new').length : 0;
    document.title = waiting > 0 ? `(${waiting}) New order${waiting === 1 ? '' : 's'} — Peter's Pizzeria` : BASE_TITLE;
    return () => { document.title = BASE_TITLE; };
  }, [orders]);

  const finished = orders ? orders.filter((o) => o.status === 'done' || o.status === 'cancelled') : [];

  if (authed === null) {
    return <div className="admin-page"><div className="admin-loading">Checking session…</div></div>;
  }

  if (!authed) {
    return (
      <div className="admin-page">
        {notice && <div className="admin-notice">{notice}</div>}
        <Login onSuccess={() => { setNotice(''); setAuthed(true); }} />
        <Footer nav={nav} />
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-head">
        <div>
          <div className="section-label" style={{ color: 'var(--gold)' }}>Admin</div>
          <h1 className="admin-title">Order <em>board.</em></h1>
        </div>
        <div className="admin-head-right">
          <span className="admin-live"><span className="pulse-dot" aria-hidden="true" /> Live · refreshes every 5s</span>
          <button type="button" className="admin-logout" onClick={() => logout()}><LogOut size={12} /> Log out</button>
        </div>
      </div>

      <div className="admin-body">
      {storeError && <div className="order-error admin-store-error" role="alert">{storeError}</div>}
      {storeInfo && (
        <StorePanel
          storeInfo={storeInfo} savingStore={savingStore}
          draft={draft} setDraft={setDraft} saveStore={saveStore} currentHours={currentHours}
        />
      )}

      {storeInfo && (
        <AvailabilityPanel unavailableSet={unavailableSet} savingStore={savingStore} toggleItem={toggleItem} />
      )}

      <SlicesPanel
        slices={slices}
        busyId={sliceBusyId}
        armedId={sliceArmedId}
        hideSlice={hideSlice}
        removeSlice={removeSlice}
      />

      <div className="fire-panel">
        <div className="fire-panel-label"><Flame size={13} /> Fire next</div>
        {fireNext.waiting === 0 ? (
          <div className="fire-empty">Oven&apos;s clear — no new orders waiting.</div>
        ) : (
          <>
            <div className="fire-counts">
              {fireNext.pizzas.map(([itemName, count]) => (
                <div key={itemName} className="fire-chip"><strong>{count}×</strong> {itemName}</div>
              ))}
              {fireNext.addons.map(([itemName, count]) => (
                <div key={itemName} className="fire-chip fire-chip-dim"><strong>{count}×</strong> {displayName(itemName)}</div>
              ))}
            </div>
            <div className="fire-sub">
              {fireNext.waiting} order{fireNext.waiting === 1 ? '' : 's'} waiting ·{' '}
              {ageLabel(fireNext.oldest) === 'just now' ? 'oldest placed just now' : `oldest waiting ${ageLabel(fireNext.oldest)}`}
            </div>
          </>
        )}
      </div>

      {orders === null ? (
        <div className="admin-loading">Loading orders…</div>
      ) : (
        <Board orders={orders} advance={advance} cancel={cancel} />
      )}

      {finished.length > 0 && <FinishedList finished={finished} />}
      </div>

      <Footer nav={nav} />
    </div>
  );
}
