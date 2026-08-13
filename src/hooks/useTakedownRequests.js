import { useCallback, useState } from 'react';
import { api } from '../utils/api';

// The admin board's half of the takedown-request feature: the pending queue
// plus the two ways to resolve one.
//
// The list is *fed in* rather than fetched here — AdminPage already polls
// orders and store status every 5s and batches reports into that same
// Promise.all, and a second interval running its own poll would double the
// board's request rate for a feature that's idle almost all the time. So this
// owns the state and the mutations; the caller owns the fetch.
//
// `epoch` is AdminPage's poll-invalidation ref, passed in so a resolve can
// invalidate a poll snapshot taken before it — otherwise the 5s poll already
// in flight lands afterward and puts the row that was just handled back on
// the screen.
export function useTakedownRequests({ epoch, onAuthError }) {
  const [reports, setReports] = useState([]);
  const [busySliceId, setBusySliceId] = useState(null);
  const [error, setError] = useState('');
  // The poll swallows a failed reports fetch so it can't blank the order
  // board — but "the endpoint is broken" then looks exactly like "nobody has
  // reported anything", forever and silently. This is the difference, so a
  // request can't go unseen because the fetch was quietly failing.
  const [unavailable, setUnavailable] = useState(false);

  const resolve = useCallback(async (report, action) => {
    setBusySliceId(report.sliceId);
    setError('');
    epoch.current += 1; // invalidate polls in flight before this mutation
    try {
      if (action === 'takeDown') {
        // Deleting the photo clears its report server-side too (api/slices.js
        // remove()), so there's no second call to make here.
        await api(`/api/slices?id=${encodeURIComponent(report.sliceId)}`, { method: 'DELETE' });
      } else {
        await api(`/api/reports?sliceId=${encodeURIComponent(report.sliceId)}`, { method: 'DELETE' });
      }
      epoch.current += 1; // …and polls whose GET raced the DELETE server-side
      setReports((list) => list.filter((r) => r.sliceId !== report.sliceId));
    } catch (err) {
      if (err.status === 401) onAuthError();
      else setError(err.message || 'Could not handle that request — try again.');
    } finally {
      setBusySliceId(null);
    }
  }, [epoch, onAuthError]);

  const takeDown = useCallback((report) => resolve(report, 'takeDown'), [resolve]);
  const dismiss = useCallback((report) => resolve(report, 'dismiss'), [resolve]);

  return { reports, setReports, busySliceId, error, takeDown, dismiss, unavailable, setUnavailable };
}
