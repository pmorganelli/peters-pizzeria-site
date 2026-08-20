import { Component } from 'react';

// A render error anywhere below this point used to take the whole app down to a
// blank white page — including the nav, so a customer mid-order had no way back
// except retyping the URL. React only offers this as a class component; there is
// no hook equivalent.
//
// Mounted with a key of the current page (see App.jsx), so simply navigating
// somewhere else builds a fresh instance and clears the error. That's why the
// nav has to live *outside* the boundary: it stays interactive underneath this
// fallback and is the actual escape hatch.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    // No error-reporting service on this project, so the console is the only
    // record. Kept deliberately: in production this is the one breadcrumb
    // available if someone reports "the page went blank".
    console.error('Page crashed:', error, info?.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="crash-page">
        <div className="crash-inner">
          <div className="section-label">Well, that&apos;s embarrassing</div>
          <h1 className="crash-title">This page burned.</h1>
          <p className="crash-body">
            Something broke on our end — not on yours. Your cart and any order
            you&apos;ve already placed are saved on this device, so nothing is lost.
          </p>
          <div className="crash-actions">
            <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
              Reload the page
            </button>
            {this.props.onGoHome && (
              <button type="button" className="btn-ghost" onClick={this.props.onGoHome}>
                Back to home
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
