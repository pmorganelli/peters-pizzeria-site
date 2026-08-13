import { Flag } from 'lucide-react';
import { ageLabel } from '../utils/orders';

// Takedown requests from the community wall, resolved from the order board.
//
// Renders nothing at all when there's nothing to review — the board is a
// working surface during service and an empty "0 requests" panel would be
// noise on every shift. It only exists on the screen when someone has asked
// for a photo to come down.
// Header-bar counterpart to the panel below. The panel sits at the top of the
// board, which is exactly where nobody is looking mid-service — this rides in
// the header and jumps to it, so a request can't arrive unnoticed while the
// order columns are what's on screen.
export function TakedownAlert({ count, unavailable }) {
  if (unavailable) {
    return (
      <span className="admin-takedown-down" role="status">
        <Flag size={12} /> Takedown requests unavailable
      </span>
    );
  }
  if (!count) return null;
  return (
    <button
      type="button"
      className="admin-takedown-alert"
      // The panel mounts and unmounts with the queue, so a ref held by
      // AdminPage would be null on exactly the renders where this is hidden.
      onClick={() => document.getElementById('takedown-requests')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
    >
      <Flag size={12} />
      {count} takedown request{count === 1 ? '' : 's'}
    </button>
  );
}

export function ReportsPanel({ reports, busySliceId, takeDown, dismiss, error }) {
  if (!reports.length) return null;
  return (
    // id is the scroll target for the header alert — the panel mounts and
    // unmounts with the queue, so a ref held by AdminPage would be null on
    // exactly the renders where the alert isn't shown anyway.
    <div className="reports-panel" id="takedown-requests">
      <div className="reports-panel-label">
        <Flag size={13} /> Takedown requests
        <span className="reports-count">{reports.length}</span>
      </div>
      {error && <div className="order-error admin-store-error" role="alert">{error}</div>}
      <div className="reports-list">
        {reports.map((r) => (
          <div key={r.sliceId} className="reports-row">
            <img className="reports-thumb" src={r.slice.url} alt={r.slice.caption || 'Reported photo'} />
            <div className="reports-meta">
              <div className="reports-who">
                {r.slice.name || 'Anonymous'}
                {r.count > 1 && <span className="reports-multi">{r.count} people asked</span>}
              </div>
              {r.slice.caption && <div className="reports-caption">{r.slice.caption}</div>}
              <div className="reports-age">Requested {ageLabel(r.lastAt)}</div>
            </div>
            <div className="reports-actions">
              <button type="button" className="reports-take-down" disabled={busySliceId === r.sliceId} onClick={() => takeDown(r)}>
                Take it down
              </button>
              <button type="button" className="reports-keep" disabled={busySliceId === r.sliceId} onClick={() => dismiss(r)}>
                Keep it
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
