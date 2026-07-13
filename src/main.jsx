import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// react-scan runs in dev only — Vite strips this whole block from production
// builds, so no third-party profiling code ever ships to visitors.
if (import.meta.env.DEV) {
  import('react-scan').then(({ scan }) => scan({ enabled: true }));
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
