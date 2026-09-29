import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Flame, LogOut, Moon, RotateCcw, Store, UtensilsCrossed, Wheat } from 'lucide-react';
import { Footer } from '../components/Footer';
import { ReportsPanel, TakedownAlert } from '../components/ReportsPanel';
import { BOARD_VIEWS, OrderTable } from '../components/OrderTable';
import { useTakedownRequests } from '../hooks/useTakedownRequests';
import { useBoardTitle } from '../hooks/useBoardTitle';
import { useDoughStock } from '../hooks/useDoughStock';
import { MENU_DATA } from '../data/menu';
import { api } from '../utils/api';
import { readStored, writeStored } from '../utils/storage';
import { DAY_NAMES, displayName, fmtMoney, fmtTime, formatOrderItems, ageLabel } from '../utils/orders';
import { DOUGH_LABELS, DOUGH_TYPES, MAX_DOUGH_BALLS, SLICES_PER_BALL, soldOutNames } from '../utils/dough';

const POLL_MS = 5000;
const PIZZA_CATEGORY = MENU_DATA[0].category;
// Full or compact rows — a per-device preference (the phone at the window and
// the laptop by the oven want different densities), so browser storage rather
// than anything shared.
const VIEW_KEY = 'pp_board_view:v1';
const initialView = () => {
  const saved = readStored(VIEW_KEY);
  return BOARD_VIEWS.includes(saved) ? saved : 'full';
};

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

// Tonight's stock. Staff count dough *balls* because that's what's in the
// fridge; everything downstream works in slices, and this panel is where the
// two meet — hence the "× 8" spelled out next to each field rather than a bare
// number whose units you have to remember.
//
// A blank field means that dough isn't being counted tonight, which is not the
// same as zero and is why this can't just be two numbers defaulting to 0: zero
// balls is "sold out, refuse everything", and a board that started there would
// stop service until someone typed into it.
//
// **Each box is the night's running total, not a delta**, and the copy has to
// keep saying so. The slices-sold counter is never rebased, so a staffer who
// bakes two more balls mid-night and types `2` hasn't added dough — they've
// set capacity below what's already gone, which greys the pool out everywhere
// and starts refusing orders. The server rejects that save (api/store.js) and
// this panel says what the number means before they type it.
function DoughPanel({ doughInfo, draft, editDough, savingStore, saveDough, stopCounting }) {
  const counting = Object.keys(doughInfo ?? {}).length > 0;
  return (
    <div className="dough-panel">
      <div className="store-panel-label"><Wheat size={13} /> Dough — tonight&rsquo;s total balls</div>
      <div className="dough-rows">
        {DOUGH_TYPES.map((type) => {
          const live = doughInfo?.[type];
          return (
            <div key={type} className="dough-row">
              <label className="dough-field">
                <span className="dough-field-name">{DOUGH_LABELS[type]}</span>
                <input
                  type="number"
                  min="0"
                  max={MAX_DOUGH_BALLS}
                  inputMode="numeric"
                  placeholder="—"
                  value={draft[type]}
                  aria-label={`${DOUGH_LABELS[type]} dough balls`}
                  onChange={(e) => editDough(type, e.target.value)}
                />
                <span className="dough-unit">balls × {SLICES_PER_BALL[type]}</span>
              </label>
              <div className="dough-readout">
                {live ? (
                  <>
                    <strong className={live.remaining === 0 ? 'dough-out' : undefined}>
                      {live.remaining} slice{live.remaining === 1 ? '' : 's'} left
                    </strong>
                    <span className="dough-spent">{live.used} of {live.slices} sold</span>
                  </>
                ) : (
                  <span className="dough-untracked">Not counted — sells without a limit</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="dough-actions">
        <button type="button" className="store-save" disabled={savingStore} onClick={saveDough}>
          Save dough
        </button>
        {counting && (
          <button type="button" className="dough-stop" disabled={savingStore} onClick={stopCounting}>
            Stop counting
          </button>
        )}
      </div>
    </div>
  );
}

function AvailabilityPanel({ unavailableSet, savingStore, toggleItem }) {
  return (
    <div className="avail-panel">
      <div className="store-panel-label"><UtensilsCrossed size={13} /> Availability — tap to sell out an item</div>
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

export function AdminPage({ nav, onAuthChange }) {
  // null = still checking with the server; the cookie is HttpOnly so this
  // page can't just read it out of storage to know if it's logged in.
  const [authed, setAuthedState] = useState(null);
  // App owns the session answer for the rest of the site (the nav's Order Now
  // button, what /order renders), but this is the only page that can *change*
  // it mid-session — it holds the login form and the logout button. So every
  // place this page learns something, App hears it too; otherwise logging in
  // here would leave the nav a reload behind.
  //
  // Stable as long as onAuthChange is: App passes its raw setState, so the
  // effects and callbacks below still run once each rather than per render.
  const setAuthed = useCallback((value) => {
    setAuthedState(value);
    onAuthChange?.(value);
  }, [onAuthChange]);
  const [orders, setOrders] = useState(null); // null = not loaded yet
  const [notice, setNotice] = useState('');
  const [storeInfo, setStoreInfo] = useState(null);
  const [draft, setDraft] = useState({ day: 6, start: '19:00', end: '20:30' });
  const [savingStore, setSavingStore] = useState(false);
  const [storeError, setStoreError] = useState('');
  const [closingNight, setClosingNight] = useState(false);
  const [view, setViewState] = useState(initialView);
  const setView = (next) => { setViewState(next); writeStored(VIEW_KEY, next); };
  const draftSeeded = useRef(false);
  // Bumped by every mutation (advance, 86 toggle, hours save). A poll snapshot
  // taken before a mutation is stale — applying it would visually revert the
  // change, and a re-tap would then persist the wrong state to the server.
  const epochRef = useRef(0);
  const pollIssuedRef = useRef(0);
  const pollAppliedRef = useRef(0);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  useEffect(() => {
    api('/api/login').then((d) => setAuthed(Boolean(d.authenticated))).catch(() => setAuthed(false));
  }, [setAuthed]);

  const logout = useCallback(async (message = '') => {
    // Only the server can clear an HttpOnly cookie — there's nothing for this
    // page to remove locally.
    try { await api('/api/login', { method: 'DELETE' }); } catch { /* clearing client state below is enough */ }
    setOrders(null);
    setNotice(message);
    setAuthed(false);
  }, [setAuthed]);

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

  // Declared above `load` on purpose: load() syncs the dough boxes through
  // useDoughStock, and that hook needs this function at render time. A
  // useCallback rather than a plain arrow so the hook's own callbacks aren't
  // rebuilt on every poll.
  const saveStore = useCallback(async (next) => {
    setSavingStore(true);
    setStoreError('');
    epochRef.current += 1; // invalidate polls in flight before this save
    try {
      const status = await api('/api/store', { method: 'PATCH', body: next });
      epochRef.current += 1; // …and polls whose GET raced the PATCH server-side
      setStoreInfo(status);
      return true;
    } catch (err) {
      if (err.status === 401) logout('Session expired — log in again.');
      else setStoreError(err.message || 'Could not save — try again.');
      return false;
    } finally {
      setSavingStore(false);
    }
  }, [logout]);

  const {
    draft: doughDraft, edit: editDough,
    sync: syncDough, save: saveDough, stop: stopCounting, reset: resetDough,
  } = useDoughStock({ saveStore, onError: setStoreError });

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
      syncDough(status.dough);
    } catch (err) {
      // As with successful polls, an issued-but-unsettled request must not
      // suppress this result. Ignore only errors older than applied state.
      if (epochRef.current === snapshot && sequence > pollAppliedRef.current && err.status === 401) {
        logout('Session expired — log in again.');
      }
    }
  }, [authed, logout, syncDough, setReports, setReportsUnavailable]);

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
      // The server just cleared tonight's dough back to untracked. Blank the
      // boxes *and* the readout beside them together — the next poll is up to
      // 5s away, and until it lands the panel would otherwise show empty boxes
      // next to last night's "slices left", with Stop counting still offered.
      resetDough();
      setStoreInfo((info) => info && { ...info, dough: {} });
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
    if (window.confirm(`Cancel ${order.name}'s order?`)) advance(order, 'cancelled');
  };

  // A name or note corrected in the table. Optimistic like advance(), but a
  // refusal is worth saying out loud: the cell snaps back to the old value on
  // the resync, and without a message that just looks like the edit vanished.
  const editOrder = async (order, fields) => {
    epochRef.current += 1;
    setOrders((list) => list.map((o) => (o.id === order.id ? { ...o, ...fields } : o)));
    setStoreError('');
    try {
      const { order: saved } = await api(`/api/orders?id=${encodeURIComponent(order.id)}`, { method: 'PATCH', body: fields });
      epochRef.current += 1;
      setOrders((list) => list.map((o) => (o.id === saved.id ? saved : o)));
    } catch (err) {
      if (err.status === 401) { logout('Session expired — log in again.'); return; }
      setStoreError(err.message || 'Could not save that change — try again.');
      load();
    }
  };

  // A changed order. Not optimistic, unlike the edits above: the server
  // re-prices it and may refuse it for dough, and the editor stays open with
  // the reason until the staffer trims it — so it waits for the answer and
  // hands back { error } instead of a board-wide message.
  const editItems = async (order, items) => {
    epochRef.current += 1;
    try {
      const { order: saved } = await api(`/api/orders?id=${encodeURIComponent(order.id)}`, { method: 'PATCH', body: { items } });
      epochRef.current += 1;
      setOrders((list) => list.map((o) => (o.id === saved.id ? saved : o)));
      return {};
    } catch (err) {
      if (err.status === 401) { logout('Session expired — log in again.'); return {}; }
      load();
      return { error: err.message || 'Could not save that change — try again.' };
    }
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
        <DoughPanel
          doughInfo={storeInfo.dough} draft={doughDraft} editDough={editDough}
          savingStore={savingStore} saveDough={saveDough} stopCounting={stopCounting}
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

      <div className="board-toolbar">
        <div className="board-col-title board-toolbar-title">Live orders</div>
        <div className="store-modes board-view-toggle" role="group" aria-label="Board view">
          {BOARD_VIEWS.map((v) => (
            <button key={v} type="button" className={view === v ? 'active' : ''} aria-pressed={view === v} onClick={() => setView(v)}>
              {v === 'full' ? 'Full' : 'Compact'}
            </button>
          ))}
        </div>
      </div>

      {orders === null ? (
        <div className="admin-loading">Loading orders…</div>
      ) : (
        <OrderTable
          orders={orders} view={view} soldOut={soldOutNames(storeInfo)}
          onAdvance={advance} onCancel={cancel} onEdit={editOrder} onEditItems={editItems}
        />
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
