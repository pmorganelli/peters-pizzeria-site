// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, allowConsole } from '../../tests/helpers/dom.jsx';
import { ErrorBoundary } from './ErrorBoundary';

function Boom() {
  throw new Error('kaboom');
}

// A caught render error is *supposed* to reach the console — componentDidCatch
// logs it deliberately, since there's no error-reporting service on this
// project and it's the only breadcrumb when someone reports a blank page. React
// also logs its own report. Whitelist both rather than muting the guard.
function expectCrashLogging() {
  allowConsole(/Page crashed/);
  allowConsole(/kaboom/);
  allowConsole(/error boundary|The above error/i);
}

describe('ErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    render(<ErrorBoundary><p>all good</p></ErrorBoundary>);
    expect(screen.getByText('all good')).toBeTruthy();
  });

  it('shows the fallback instead of a blank page when a child throws', () => {
    expectCrashLogging();
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByText('This page burned.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /reload the page/i })).toBeTruthy();
  });

  it('still records the crash to the console', () => {
    expectCrashLogging();
    const spy = vi.spyOn(console, 'error');
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(spy.mock.calls.some(([first]) => String(first).includes('Page crashed'))).toBe(true);
  });

  it('offers the home button only when a handler is supplied', () => {
    expectCrashLogging();
    const onGoHome = vi.fn();
    const { unmount } = render(<ErrorBoundary onGoHome={onGoHome}><Boom /></ErrorBoundary>);
    fireEvent.click(screen.getByRole('button', { name: /back to home/i }));
    expect(onGoHome).toHaveBeenCalledTimes(1);
    unmount();

    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.queryByRole('button', { name: /back to home/i })).toBeNull();
  });

  // The fallback is deliberately plain — no GSAP, no photos, nothing that
  // could throw a second time while it's busy reporting the first failure.
  it('renders a fallback with no images to fail on', () => {
    expectCrashLogging();
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(document.querySelectorAll('.crash-page img')).toHaveLength(0);
  });

  // Keyed on page in App.jsx, so navigating elsewhere mounts a fresh instance
  // and clears the error. Keying on `page` alone would strand a crashed
  // article, since `page` never leaves 'article' — hence page:articleId.
  it('clears the error when remounted under a new key', () => {
    expectCrashLogging();
    const { rerender } = render(
      <ErrorBoundary key="article:1"><Boom /></ErrorBoundary>,
    );
    expect(screen.getByText('This page burned.')).toBeTruthy();

    rerender(<ErrorBoundary key="article:2"><p>the next article</p></ErrorBoundary>);
    expect(screen.getByText('the next article')).toBeTruthy();
    expect(screen.queryByText('This page burned.')).toBeNull();
  });
});
