import { ArrowRight, Check, Clock, Flame } from 'lucide-react';
import { displayName, fmtMoney, STATUS_LABELS } from '../utils/orders';

const VENMO_URL = 'https://venmo.com/u/Peter-Morganelli24';

const TIMELINE = [
  { status: 'new', label: 'Received', Icon: Clock },
  { status: 'firing', label: 'In the oven', Icon: Flame },
  { status: 'ready', label: 'Ready for pickup', Icon: Check },
];

// Big human-readable status line — one glance should answer "where's my slice?"
const STATUS_META = {
  new:       { label: 'Order received',    text: "You're in line — we'll fire your slices soon." },
  firing:    { label: 'In the oven',       text: 'Your slices are cooking right now.' },
  ready:     { label: 'Ready for pickup!', text: 'Come to the window and show your code.' },
  done:      { label: 'Picked up',         text: 'Enjoy! Thanks for supporting us.' },
  cancelled: { label: 'Cancelled',         text: 'This order was cancelled.' },
};

// Live order card shared by the order confirmation and the Slice Status page.
export function OrderStatusCard({ order, onNewOrder }) {
  const doneIdx = TIMELINE.findIndex((s) => s.status === order.status);
  // 'done' means every step is complete; -1 only happens for 'cancelled'
  const activeIdx = order.status === 'done' ? TIMELINE.length : doneIdx;

  return (
    <div className="confirm-wrap">
      <div className="confirm-card">
        <div className="section-label">Order placed</div>
        <h2 className="confirm-title">
          Thanks, {order.name.split(' ')[0]} — <em>you&apos;re in the queue.</em>
        </h2>

        {/* keyed by status so the banner re-animates when the kitchen advances the order */}
        <div
          key={order.status}
          className={`status-banner${order.status === 'ready' ? ' status-banner-ready' : ''}${order.status === 'cancelled' ? ' status-banner-cancelled' : ''}`}
          role="status"
        >
          <span className="status-banner-pill">
            <span className="status-banner-dot" aria-hidden="true" />
            {STATUS_META[order.status]?.label ?? order.status}
          </span>
          <span className="status-banner-text">{STATUS_META[order.status]?.text}</span>
        </div>

        <div className="confirm-code-row">
          <div>
            <div className="confirm-code-label">Pickup code</div>
            <div className="confirm-code">#{order.code}</div>
          </div>
          <div className="confirm-hint">Show this screen when you pick up. This page updates as we cook.</div>
        </div>

        {order.status === 'cancelled' ? (
          <div className="confirm-cancelled">
            This order was cancelled. If that&apos;s a surprise, find us at the window or on Instagram.
          </div>
        ) : (
          <div className="confirm-timeline">
            {TIMELINE.map(({ status, label, Icon }, i) => {
              const state = i < activeIdx ? 'past' : i === activeIdx ? 'active' : 'todo';
              return (
                <div key={status} className={`tl-step tl-${state}`}>
                  <div className="tl-dot"><Icon size={13} /></div>
                  <div className="tl-label">{label}</div>
                </div>
              );
            })}
          </div>
        )}

        <div className="confirm-items">
          {order.items.map((it) => (
            <div key={it.name} className="order-line">
              <span className="order-line-name">{it.qty} × {displayName(it.name)}</span>
              <span>{fmtMoney(it.priceCents * it.qty)}</span>
            </div>
          ))}
          <div className="order-line order-total">
            <span>Total</span>
            <span>{fmtMoney(order.totalCents)}</span>
          </div>
        </div>

        <div className="confirm-actions">
          <a className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }} href={VENMO_URL} target="_blank" rel="noreferrer">
            Pay {fmtMoney(order.totalCents)} on Venmo <ArrowRight size={13} />
          </a>
          <button className="text-link-btn" onClick={onNewOrder}>Start another order</button>
        </div>
        <div className="confirm-fineprint">
          Venmo @Peter-Morganelli24 or Zelle — pay now or at the window. Current status: {STATUS_LABELS[order.status]}.
        </div>
      </div>
    </div>
  );
}
