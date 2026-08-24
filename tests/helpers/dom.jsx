// Shared harness for the component tests. Importing this module registers the
// per-test cleanup and stubs, so a test file only has to add the
// `@vitest-environment jsdom` docblock and import from here.
//
// The API/util tests stay on the default `node` environment (see
// vitest.config.js) — this file is only pulled in by the files that render.
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

// ── jsdom gaps ────────────────────────────────────────────────────────
// jsdom implements neither of the observers nor matchMedia, and the app calls
// all three on mount: every GSAP effect gates on a reduced-motion match, the
// community wall measures its grid with a ResizeObserver, and ScrollTrigger
// reaches for IntersectionObserver. Without these the render throws before a
// single assertion runs — which looks like "the component is broken" rather
// than "the test environment is incomplete".
function installEnvironmentStubs() {
  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      // `false` means "no preference expressed", which is the branch the app
      // treats as *animations on*. Reduced-motion behaviour is asserted by
      // passing an explicit stub in the test that cares, not globally here.
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
  }

  for (const name of ['ResizeObserver', 'IntersectionObserver']) {
    if (!globalThis[name]) {
      globalThis[name] = class {
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() { return []; }
      };
    }
  }

  // <dialog> is what the lightbox uses for its focus trap; jsdom parses the
  // element but doesn't implement the modal methods.
  if (typeof HTMLDialogElement !== 'undefined') {
    if (!HTMLDialogElement.prototype.showModal) {
      HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
    }
    if (!HTMLDialogElement.prototype.close) {
      HTMLDialogElement.prototype.close = function close() { this.open = false; };
    }
  }

  // Pages scroll themselves to the top on mount. Assigned unconditionally:
  // jsdom *does* define scrollTo, it just throws "Not implemented" and prints
  // to stderr, so a `if (!window.scrollTo)` guard never fires and the noise
  // survives. Same for scrollIntoView, which the takedown alert calls.
  window.scrollTo = () => {};
  window.scrollBy = () => {};
  Element.prototype.scrollIntoView = () => {};

  // jsdom ships no 2D canvas (that needs the native `canvas` package) and
  // prints "Not implemented" to stderr when asked. The share card on
  // StudioPage and the upload downscaler both reach for one. A no-op context is
  // enough for the tests here, which assert that a page mounts, not what it
  // painted — anything asserting on pixels needs a real browser and belongs in
  // TESTING.md's manual checklist instead.
  HTMLCanvasElement.prototype.getContext = () => ({
    fillRect: () => {}, clearRect: () => {}, drawImage: () => {},
    fillText: () => {}, strokeText: () => {}, measureText: () => ({ width: 0 }),
    beginPath: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {},
    arc: () => {}, fill: () => {}, stroke: () => {}, save: () => {}, restore: () => {},
    translate: () => {}, rotate: () => {}, scale: () => {}, setTransform: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {}, roundRect: () => {}, clip: () => {},
  });
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,';
  HTMLCanvasElement.prototype.toBlob = (cb) => cb(new Blob([], { type: 'image/jpeg' }));
}

installEnvironmentStubs();

// ── console guard ─────────────────────────────────────────────────────
// The point of the component suite is to catch the things that don't throw:
// a React key warning, an unknown DOM property being dropped, an act() gap, a
// removed-API deprecation notice after a major upgrade. React reports all of
// those through console.error/warn and then carries on rendering, so a test
// that only asserts on output stays green while the console fills up.
//
// Anything written to either channel during a test fails it. A test that
// *expects* a message calls `allowConsole(/pattern/)` to whitelist it.
let consoleErrors = [];
let allowed = [];

export function allowConsole(pattern) {
  allowed.push(pattern);
}

beforeEach(() => {
  consoleErrors = [];
  allowed = [];
  for (const channel of ['error', 'warn']) {
    vi.spyOn(console, channel).mockImplementation((...args) => {
      consoleErrors.push({ channel, text: args.map(String).join(' ') });
    });
  }
});

afterEach(() => {
  cleanup();
  const unexpected = consoleErrors.filter(
    ({ text }) => !allowed.some((p) => (p instanceof RegExp ? p.test(text) : text.includes(p))),
  );
  vi.restoreAllMocks();
  expect(
    unexpected,
    `Unexpected console output during this test:\n${unexpected.map((e) => `  [${e.channel}] ${e.text}`).join('\n')}`,
  ).toEqual([]);
});

// ── fetch ─────────────────────────────────────────────────────────────
// Routes are matched newest-first so a test can override a default set up by
// an earlier call. An unmatched request is a failure rather than a silent
// empty response: a page quietly fetching something the test didn't plan for
// is exactly the kind of drift worth hearing about.
export function mockFetch(routes) {
  const entries = Object.entries(routes).reverse();
  const impl = vi.fn(async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const hit = entries.find(([pattern]) => url.includes(pattern));
    if (!hit) throw new Error(`Unmocked fetch: ${init.method || 'GET'} ${url}`);
    const value = typeof hit[1] === 'function' ? await hit[1](url, init) : hit[1];
    const { status = 200, body = {} } = value;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  });
  vi.stubGlobal('fetch', impl);
  return impl;
}

export { render };
export * from '@testing-library/react';
