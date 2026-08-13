import { Flag } from 'lucide-react';
import { ageLabel } from '../utils/orders';

// Takedown requests from the community wall, resolved from the order board.
//
// Renders nothing at all when there's nothing to review — the board is a
// working surface during service and an empty "0 requests" panel would be
// noise on every shift. It only exists on the screen when someone has asked
// for a photo to come down.
export function ReportsPanel({ reports, busySliceId, takeDown, dismiss, error }) {
  if (!reports.length) return null;
  return (
    <div className="reports-panel">
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
