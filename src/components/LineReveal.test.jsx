// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '../../tests/helpers/dom.jsx';
import { LineReveal } from './LineReveal';

// The harness stubs matchMedia to "no preference / no match" for everything.
// These tests need to steer individual queries, so they install their own.
function withMedia(matches) {
  const original = window.matchMedia;
  window.matchMedia = (query) => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {},
    dispatchEvent: () => false,
  });
  return () => { window.matchMedia = original; };
}

const isPhone = (q) => q.includes('max-width: 768px');
const isReduced = (q) => q.includes('prefers-reduced-motion');

let restore = () => {};
afterEach(() => { restore(); });

// SplitText wraps each rendered line in its own element. That's the signal used
// throughout: split path → extra child elements, unsplit path → none.
const splitChildren = (el) => el.querySelectorAll(':scope > div').length;

describe('LineReveal', () => {
  it('renders its text either way', () => {
    restore = withMedia(() => false);
    render(<LineReveal as="h1" text="Order ahead. Skip the line." />);
    expect(screen.getByText('Order ahead. Skip the line.')).toBeTruthy();
  });

  it('renders children when the headline carries markup', () => {
    restore = withMedia(() => false);
    render(
      <LineReveal as="h1" splitKey="menu-hero">
        Dough on<br /><em>Saturdays.</em>
      </LineReveal>,
    );
    expect(document.querySelector('h1').textContent).toContain('Saturdays.');
  });

  it('always carries the line-reveal class alongside any className given', () => {
    restore = withMedia(() => false);
    render(<LineReveal as="h1" className="menu-hero-title" text="Hello" />);
    const el = document.querySelector('h1');
    expect(el.classList.contains('line-reveal')).toBe(true);
    expect(el.classList.contains('menu-hero-title')).toBe(true);
  });

  // The fix. Below 768px the per-line split is skipped entirely: it can't start
  // until the webfont resolves, it does synchronous layout while the 260ms page
  // transition is running, and it animates inside overflow-clipped masks. The
  // phone path is one tween on the element instead.
  describe('on a phone', () => {
    it('does not split the headline into lines', () => {
      restore = withMedia(isPhone);
      render(<LineReveal as="h1" text="From the kitchen and beyond." />);
      expect(splitChildren(document.querySelector('h1'))).toBe(0);
      // and the text is still there, which is the part that must never regress
      expect(document.querySelector('h1').textContent).toBe('From the kitchen and beyond.');
    });

    // The reveal must never take the headline out of the accessibility tree.
    // `autoAlpha` would: it sets `visibility: hidden`, which hides the text from
    // screen readers for the length of the tween — and permanently if the tween
    // never gets a tick (a tab mounted in the background, an interrupted
    // animation). Fading opacity alone keeps it readable throughout.
    it('never hides the headline from assistive tech', () => {
      restore = withMedia(isPhone);
      render(<LineReveal as="h1" text="Community pictures." />);
      const el = document.querySelector('h1');
      expect(el.style.visibility).not.toBe('hidden');
      expect(el.getAttribute('aria-hidden')).not.toBe('true');
      expect(el.textContent).toBe('Community pictures.');
    });

    // The phone reveal is a CSS keyframe, not a GSAP tween. That matters for
    // more than taste: a CSS animation runs on the compositor (immune to the
    // main-thread contention this whole path exists to avoid) and carries
    // `animation-fill-mode: both`, so the headline cannot be stranded invisible
    // if frames are dropped. A GSAP `from` tween applies its hidden start state
    // synchronously and only clears it once the ticker runs.
    it('animates with the CSS keyframe and leaves no inline styles', () => {
      restore = withMedia(isPhone);
      render(<LineReveal as="h1" text="Community pictures." />);
      const el = document.querySelector('h1');
      expect(el.classList.contains('line-reveal-rise')).toBe(true);
      expect(el.getAttribute('style')).toBeNull();
    });

    it('does not add the rise class on desktop', () => {
      restore = withMedia(() => false);
      render(<LineReveal as="h1" text="Dough on Saturdays." />);
      expect(document.querySelector('h1').classList.contains('line-reveal-rise')).toBe(false);
    });
  });

  describe('on a desktop', () => {
    it('splits the headline into lines', () => {
      restore = withMedia(() => false);
      render(<LineReveal as="h1" text="Dough on Saturdays." />);
      // SplitText injects one wrapper per rendered line.
      expect(splitChildren(document.querySelector('h1'))).toBeGreaterThan(0);
    });
  });

  // Reduced motion wins over both paths — the text renders plain and untouched,
  // so the content is never lost to a tween that was asked not to run.
  describe('under prefers-reduced-motion', () => {
    it('does not split or animate, on phone or desktop', () => {
      restore = withMedia(isReduced);
      render(<LineReveal as="h1" text="Where's my slice?" />);
      const el = document.querySelector('h1');
      expect(splitChildren(el)).toBe(0);
      expect(el.textContent).toBe("Where's my slice?");
      expect(el.style.visibility).not.toBe('hidden');
      // no animation class either — reduced motion means genuinely no motion
      expect(el.classList.contains('line-reveal-rise')).toBe(false);
    });

    it('takes precedence over the phone path', () => {
      restore = withMedia((q) => isReduced(q) || isPhone(q));
      const spy = vi.spyOn(window, 'matchMedia');
      render(<LineReveal as="h1" text="Reduced wins" />);
      // reduced-motion is checked first and returns before the phone branch
      expect(spy.mock.calls[0][0]).toContain('prefers-reduced-motion');
      expect(document.querySelector('h1').textContent).toBe('Reduced wins');
    });
  });
});
