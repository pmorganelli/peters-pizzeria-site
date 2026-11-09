import React from 'react';
import ReactDOM from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import App from './App';
import './index.css';

// react-scan is a render profiler: it instruments every component and paints an
// overlay on each re-render. That instrumentation is expensive — it drags the
// dev server down to single-digit FPS on animation-heavy pages, which reads as
// "the site is slow" when the site is fine and the profiler isn't.
//
// So it's opt-in rather than on-by-default. Turn it on for a session with:
//   VITE_REACT_SCAN=1 npm run dev
//
// The `import.meta.env.DEV` guard stays outside it: Vite strips this whole
// block from production builds, so no profiling code ever ships to visitors.
if (import.meta.env.DEV && import.meta.env.VITE_REACT_SCAN === '1') {
  import('react-scan').then(({ scan }) => scan({ enabled: true }));
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    {/* Vercel Web Analytics. The package sat in package.json unused, so no
        page view was ever recorded. In production this loads
        /_vercel/insights/script.js from our own origin, which the CSP's
        `script-src 'self'` / `connect-src 'self'` already allow; it only
        reports once Web Analytics is enabled for the project in the Vercel
        dashboard. Route changes are picked up from the History API. */}
    <Analytics />
  </React.StrictMode>
);
