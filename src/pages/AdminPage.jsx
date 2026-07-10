import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Flame, LogOut, RotateCcw, X } from 'lucide-react';
import { Footer } from '../components/Footer';
import { MENU_DATA } from '../data/menu';
import { api } from '../utils/api';
import { displayName, fmtMoney, ageLabel } from '../utils/orders';

const TOKEN_KEY = 'pp_admin_token';
const POLL_MS = 5000;
const PIZZA_CATEGORY = MENU_DATA[0].category;
const ADDON_CATEGORY = MENU_DATA[1].category;
const BASE_TITLE = document.title;

const COLUMNS = [
  { status: 'new', title: 'New', action: 'Start firing', next: 'firing', Icon: Flame },
  { status: 'firing', title: 'In the oven', action: 'Mark ready', next: 'ready', Icon: Check },
  { status: 'ready', title: 'Ready for pickup', action: 'Picked up', next: 'done', Icon: Check },
];

function Login({ onToken }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { token } = await api('/api/login', { method: 'POST', body: { password } });
      localStorage.setItem(TOKEN_KEY, token);
      onToken(token);
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
            autoFocus
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
          <div key={it.name} className={`oc-item${it.category === PIZZA_CATEGORY ? ' oc-item-pizza' : ''}`}>
            <span className="oc-qty">{it.qty}×</span> {it.category === ADDON_CATEGORY ? `+ ${displayName(it.name)}` : it.name}
          </div>
        ))}
      </div>
      {order.notes && <div className="oc-notes">“{order.notes}”</div>}
      <div className="oc-meta">
        <span>{fmtMoney(order.totalCents)}</span>
        {order.contact && <span className="oc-contact">{order.contact}</span>}
      </div>
      <div className="oc-actions">
        <button className="oc-advance" onClick={() => onAdvance(order, column.next)}>
          <column.Icon size={12} /> {column.action}
        </button>
        {column.status === 'new' && (
          <button className="oc-cancel" aria-label={`Cancel order ${order.code}`} onClick={() => onCancel(order)}>
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

export function AdminPage({ nav }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [orders, setOrders] = useState(null); // null = not loaded yet
  const [notice, setNotice] = useState('');

  useEffect(() => { window.scrollTo(0, 0); }, []);

  const logout = useCallback((message = '') => {
    localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setOrders(null);
    setNotice(message);
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const { orders: list } = await api('/api/orders', { token });
      setOrders(list);
    } catch (err) {
      if (err.status === 401) logout('Session expired — log in again.');
    }
  }, [token, logout]);

  useEffect(() => {
    if (!token) return undefined;
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [token, load]);

  const advance = async (order, status) => {
    // Optimistic update; the next poll reconciles
    setOrders((list) => list.map((o) => (o.id === order.id ? { ...o, status } : o)));
    try {
      await api(`/api/orders?id=${encodeURIComponent(order.id)}`, { method: 'PATCH', token, body: { status } });
    } catch {
      load();
    }
  };

  const cancel = (order) => {
    if (window.confirm(`Cancel order #${order.code} for ${order.name}?`)) advance(order, 'cancelled');
  };

  const fireNext = useMemo(() => {
    if (!orders) return { pizzas: [], addons: [], waiting: 0, oldest: null };
    const queued = orders.filter((o) => o.status === 'new');
    const pizzas = new Map();
    const addons = new Map();
    for (const o of queued) {
      for (const it of o.items) {
        if (it.category === PIZZA_CATEGORY) pizzas.set(it.name, (pizzas.get(it.name) || 0) + it.qty);
        else if (it.category === ADDON_CATEGORY) addons.set(it.name, (addons.get(it.name) || 0) + it.qty);
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

  if (!token) {
    return (
      <div className="admin-page">
        {notice && <div className="admin-notice">{notice}</div>}
        <Login onToken={(t) => { setNotice(''); setToken(t); }} />
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
          <button className="admin-logout" onClick={() => logout()}><LogOut size={12} /> Log out</button>
        </div>
      </div>

      <div className="admin-body">
      <div className="fire-panel">
        <div className="fire-panel-label"><Flame size={13} /> Fire next</div>
        {fireNext.pizzas.length === 0 && fireNext.addons.length === 0 ? (
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
      )}

      {finished.length > 0 && (
        <div className="admin-finished">
          <div className="board-col-title"><RotateCcw size={11} /> Finished ({finished.length})</div>
          {finished.map((o) => (
            <div key={o.id} className="finished-row">
              <span className="oc-code">#{o.code}</span>
              <span>{o.name}</span>
              <span className="finished-items">{o.items.map((it) => `${it.qty}× ${displayName(it.name)}`).join(', ')}</span>
              <span>{fmtMoney(o.totalCents)}</span>
              <span className={`finished-status finished-${o.status}`}>{o.status === 'done' ? 'picked up' : 'cancelled'}</span>
            </div>
          ))}
        </div>
      )}
      </div>

      <Footer nav={nav} />
    </div>
  );
}
