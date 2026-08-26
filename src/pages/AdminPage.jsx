import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Check, Flame, LogOut, Moon, RotateCcw, Store, UtensilsCrossed, X } from 'lucide-react';
import { Footer } from '../components/Footer';
import { ReportsPanel, TakedownAlert } from '../components/ReportsPanel';
import { useTakedownRequests } from '../hooks/useTakedownRequests';
import { useBoardTitle } from '../hooks/useBoardTitle';
import { MENU_DATA } from '../data/menu';
import { api } from '../utils/api';
import { DAY_NAMES, addonLabel, displayName, fmtMoney, fmtTime, formatOrderItems, ageLabel, orderLineKey } from '../utils/orders';

const POLL_MS = 5000;
const PIZZA_CATEGORY = MENU_DATA[0].category;
const ADDON_CATEGORY = MENU_DATA[1].category;

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
              <span className="oc-item-addons"> · + {it.addons.map((a) => addonLabel(a.name, it.name)).join(', + ')}</span>
            )}
          </div>
        ))}
      </div>
      {order.notes && <div className="oc-notes">“{order.notes}”</div>}
      <div className="oc-meta">
        <span>{fmtMoney(order.totalCents)}</span>
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
            onClick={() => saveStore({ mode: 'open' })}
          >
            Open now
          </button>
          <button type="button"
            className={storeInfo.mode === 'closed' ? 'active' : ''}
            disabled={savingStore}
            onClick={() => saveStore({ mode: 'closed' })}
          >
            Close
          </button>
          <button type="button"
            className={storeInfo.mode === 'auto' ? 'active' : ''}
            disabled={savingStore}
            onClick={() => saveStore({ mode: 'auto' })}
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
            onClick={() => saveStore({ hours: currentHours() })}
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
        // Oldest first — a column reads top-to-bottom as a queue, and the
        // order nearest to firing/pickup should be at the top, not buried
        // under whatever just came in.
        const list = orders.filter((o) => o.status === col.status).sort((a, b) => a.createdAt - b.createdAt);
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

// Finished orders, plus a footer line with tonight's running total (picked-up
// orders only — same rule "close for the night" uses, so this number matches
// what closing will archive) and the close button itself. Keeping the total
// and the close action here, rather than a standalone panel, means they read
// as a running tally of the very rows above them.
function FinishedList({ finished, totalCents, canClose, closing, closeNight }) {
  return (
    <div className="admin-finished">
      <div className="board-col-title"><RotateCcw size={11} /> Finished ({finished.length})</div>
      {finished.length === 0
        ? <div className="board-empty">—</div>
        : finished.map((o) => (
          <div key={o.id} className="finished-row">
            <span className="oc-code">#{o.code}</span>
            <span>{o.name}</span>
            <span className="finished-items">{formatOrderItems(o.items)}</span>
            <span>{fmtMoney(o.totalCents)}</span>
            <span className={`finished-status finished-${o.status}`}>{o.status === 'done' ? 'picked up' : 'cancelled'}</span>
          </div>
        ))}
      <div className="finished-row finished-total-row">
        <span className="finished-total-label">Tonight&apos;s total</span>
        <span className="finished-total-amount">{fmtMoney(totalCents)}</span>
        <button type="button"
          className="night-close-btn"
          disabled={!canClose || closing}
          onClick={closeNight}
        >
          <Moon size={12} /> {closing ? 'Closing…' : 'Close for the night'}
        </button>
      </div>
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
  const [closingNight, setClosingNight] = useState(false);
  const draftSeeded = useRef(false);
  // Bumped by every mutation (advance, 86 toggle, hours save). A poll snapshot
  // taken before a mutation is stale — applying it would visually revert the
  // change, and a re-tap would then persist the wrong state to the server.
  const epochRef = useRef(0);
  const pollIssuedRef = useRef(0);
  const pollAppliedRef = useRef(0);

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

  // Stable identity so the hook's resolve callback isn't rebuilt every render.
  const sessionExpired = useCallback(() => logout('Session expired — log in again.'), [logout]);

  // Owns the queue and the two resolve actions; the list itself is fed from
  // the poll below rather than fetched separately. See the hook for why.
  // Destructured rather than held as one object so `load` can depend on the
  // setter alone — a `takedowns` object would be a new identity every render,
  // and depending on it would rebuild `load` and restart the 5s poll each
  // time round.
  const {
    reports, setReports, busySliceId: reportBusyId, error: reportError, takeDown, dismiss,
    unavailable: reportsUnavailable, setUnavailable: setReportsUnavailable,
  } = useTakedownRequests({ epochRef, onAuthError: sessionExpired });

  const load = useCallback(async () => {
    if (!authed) return;
    const snapshot = epochRef.current;
    const sequence = ++pollIssuedRef.current;
    try {
      const [{ orders: list }, status, reportData] = await Promise.all([
        api('/api/orders'),
        api('/api/store'),
        // Swallowed rather than awaited alongside the others: takedown
        // requests are a side feature, and a failure fetching them must not
        // blank the order board mid-service. A 401 still comes through the
        // two calls above, so an expired session is caught either way.
        // `reports: null` is the sentinel for "this fetch failed" — distinct
        // from an empty queue, which is the overwhelmingly common case.
        api('/api/reports').catch(() => ({ reports: null })),
      ]);
      // A newer request merely being issued does not make this response stale:
      // when requests consistently take longer than POLL_MS, rejecting on that
      // basis would reject every response. Only reject a response when a newer
      // one has already been applied (or a mutation invalidated its snapshot).
      if (epochRef.current !== snapshot || sequence <= pollAppliedRef.current) return;
      pollAppliedRef.current = sequence;
      setOrders(list);
      setStoreInfo(status);
      setReportsUnavailable(reportData.reports === null);
      if (reportData.reports !== null) setReports(reportData.reports);
      // Seed the schedule editor once; don't clobber in-progress edits on poll
      if (!draftSeeded.current && status.hours) {
        draftSeeded.current = true;
        setDraft({ day: status.hours.day, start: status.hours.start, end: status.hours.end });
      }
    } catch (err) {
      // As with successful polls, an issued-but-unsettled request must not
      // suppress this result. Ignore only errors older than applied state.
      if (epochRef.current === snapshot && sequence > pollAppliedRef.current && err.status === 401) {
        logout('Session expired — log in again.');
      }
    }
  }, [authed, logout, setReports, setReportsUnavailable]);

  const saveStore = async (next) => {
    setSavingStore(true);
    setStoreError('');
    epochRef.current += 1; // invalidate polls in flight before this save
    try {
      const status = await api('/api/store', { method: 'PATCH', body: next });
      epochRef.current += 1; // …and polls whose GET raced the PATCH server-side
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
    saveStore({ availability: { name, unavailable: !unavailableSet.has(name) } });
  };

  const closeNight = async () => {
    if (!orders || orders.length === 0 || closingNight) return;
    setClosingNight(true);
    setStoreError('');
    try {
      // Confirm against a fresh read, not the last poll — another admin tab
      // may have closed the night since, and quoting stale counts in the
      // dialog would have this tab archiving a board that no longer exists.
      const { orders: fresh } = await api('/api/orders');
      if (fresh.length === 0) {
        epochRef.current += 1;
        setOrders([]);
        setStoreError('The board is already empty — another device may have closed the night.');
        return;
      }
      const done = fresh.filter((o) => o.status === 'done').length;
      const active = fresh.filter((o) => o.status === 'new' || o.status === 'firing' || o.status === 'ready').length;
      const warn = active > 0 ? `\n\n${active} order${active === 1 ? ' is' : 's are'} still in progress — closing archives and clears them too.` : '';
      if (!window.confirm(`Close the night? This archives ${fresh.length} order${fresh.length === 1 ? '' : 's'} (${done} picked up) and clears the board.${warn}`)) return;
      epochRef.current += 1;
      await api('/api/nights', { method: 'POST' });
      epochRef.current += 1;
      setOrders([]);
    } catch (err) {
      if (err.status === 401) logout('Session expired — log in again.');
      // A 409 means the race still won between our fresh read and the POST —
      // the server refused rather than archiving an empty board; load() below
      // resyncs this tab to the (now empty) truth.
      else { setStoreError(err.message || 'Could not close the night — try again.'); load(); }
    } finally {
      setClosingNight(false);
    }
  };

  useEffect(() => {
    if (!authed) return undefined;
    // `load` is async and awaits Promise.all before it touches state, so
    // nothing is set synchronously here and no cascading render happens. This
    // is the subscribe-to-an-external-system case the rule exists to allow; it
    // just can't see through the async boundary to prove it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [authed, load]);

  const advance = async (order, status) => {
    // Optimistic update; the next poll reconciles
    epochRef.current += 1; // a poll from before this tap must not snap the card back
    setOrders((list) => list.map((o) => (o.id === order.id ? { ...o, status } : o)));
    try {
      await api(`/api/orders?id=${encodeURIComponent(order.id)}`, { method: 'PATCH', body: { status } });
      epochRef.current += 1;
    } catch {
      load();
    }
  };

  const cancel = (order) => {
    if (window.confirm(`Cancel order #${order.code} for ${order.name}?`)) advance(order, 'cancelled');
  };

  const unavailableSet = new Set(storeInfo?.unavailable || []);

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

  useBoardTitle({
    waiting: orders ? orders.filter((o) => o.status === 'new').length : 0,
    takedowns: reports.length,
  });

  const finished = orders
    ? orders.filter((o) => o.status === 'done' || o.status === 'cancelled').sort((a, b) => a.createdAt - b.createdAt)
    : [];
  // Revenue only counts orders actually picked up — the same rule "close for
  // the night" uses, so this matches what closing will archive.
  const tonightTotalCents = finished.filter((o) => o.status === 'done').reduce((sum, o) => sum + o.totalCents, 0);
  const canCloseNight = Boolean(orders && orders.length > 0);

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
          <TakedownAlert count={reports.length} unavailable={reportsUnavailable} />
          <span className="admin-live"><span className="pulse-dot" aria-hidden="true" /> Live · refreshes every 5s</span>
          <button type="button" className="admin-logout" onClick={() => logout()}><LogOut size={12} /> Log out</button>
        </div>
      </div>

      <div className="admin-body">
      {storeError && <div className="order-error admin-store-error" role="alert">{storeError}</div>}

      {/* First thing on the board when it exists, nothing at all when it
          doesn't — someone asking for their photo to come down shouldn't be
          buried under the storefront controls. */}
      <ReportsPanel
        reports={reports}
        busySliceId={reportBusyId}
        error={reportError}
        takeDown={takeDown}
        dismiss={dismiss}
      />

      {storeInfo && (
        <StorePanel
          storeInfo={storeInfo} savingStore={savingStore}
          draft={draft} setDraft={setDraft} saveStore={saveStore} currentHours={currentHours}
        />
      )}

      {storeInfo && (
        <AvailabilityPanel unavailableSet={unavailableSet} savingStore={savingStore} toggleItem={toggleItem} />
      )}

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

      {orders !== null && (
        <FinishedList
          finished={finished}
          totalCents={tonightTotalCents}
          canClose={canCloseNight}
          closing={closingNight}
          closeNight={closeNight}
        />
      )}
      <button type="button" className="nights-archive-link" onClick={() => nav('nights')}>
        <Archive size={12} /> Past nights archive
      </button>
      </div>

      <Footer nav={nav} />
    </div>
  );
}
