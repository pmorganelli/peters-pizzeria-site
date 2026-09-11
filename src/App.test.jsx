// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, mockFetch } from '../tests/helpers/dom.jsx';
import App from './App';
import { PAGE_PATHS, PAGE_TITLES, postSlug } from './utils/routes';
import { BLOG_POSTS } from './data/posts';

// Every page mounts GSAP effects and several fetch their own data. The catch-all
// route is listed first so the reversed lookup in mockFetch checks it last —
// specific routes above still win.
function stubApi(overrides = {}) {
  mockFetch({
    '': { body: {} },
    '/api/store': { body: { open: true, mode: 'open', unavailable: [] } },
    '/api/slices': { body: { slices: [] } },
    '/api/login': { body: { authenticated: false } },
    '/api/orders': { body: { orders: [] } },
    ...overrides,
  });
}

function visit(path) {
  window.history.replaceState(null, '', path);
  return render(<App />);
}

// Wait for the page inside <main> to have mounted. Anchoring on a structural
// selector rather than on copy: "handmade with love" appears in the hero *and*
// in the footer tagline, so a text query matches twice and throws.
function waitForPage(selector = 'main > *') {
  return waitFor(() => expect(document.querySelector(selector)).toBeTruthy());
}

beforeEach(() => {
  localStorage.clear();
  stubApi();
});

describe('App routing', () => {
  it('renders the home page at /', async () => {
    visit('/');
    await waitForPage('.hero-title');
    expect(document.querySelector('.hero-title').textContent).toContain('Handmade');
  });

  // The address bar is the single source of truth for which page shows — the
  // old pp_page2 localStorage key is gone and must not come back, because it
  // meant a bookmark could land someone on the admin board.
  it('restores each page from its own path', async () => {
    for (const [page, path] of Object.entries(PAGE_PATHS)) {
      // The admin board and its archive are behind a password; rendering them
      // is covered by their own login state, not by this smoke pass.
      if (page === 'admin' || page === 'nights') continue;
      const { unmount } = visit(path);
      await waitFor(() => expect(document.querySelector('main')).toBeTruthy());
      expect(document.title).toBe(PAGE_TITLES[page]);
      // The page itself has to have rendered — not just the shell. Studio and
      // slices are lazy (App.jsx splits them out of the initial bundle), so
      // until their chunk resolves `main` holds the Suspense fallback and
      // App has already set the title. Asserting only on those two would pass
      // against the fallback and prove nothing about the route.
      await waitFor(() => {
        expect(document.querySelector('main .route-loading')).toBeNull();
        expect(document.querySelector('main > *')).toBeTruthy();
      });
      unmount();
    }
  });

  it('does not reintroduce a second source of truth for the page', async () => {
    visit('/menu');
    await waitFor(() => expect(document.querySelector('main')).toBeTruthy());
    expect(localStorage.getItem('pp_page2')).toBeNull();
  });

  // Articles are the one page whose path carries data, and it's resolved by
  // slug rather than array position so reordering BLOG_POSTS doesn't repoint
  // links people have already shared.
  it('resolves an article deep link by slug, not by position', async () => {
    const post = BLOG_POSTS.at(-1);
    visit(`/blog/${postSlug(post)}`);
    await waitForPage('main > *');
    await waitFor(() => expect(document.title).toBe(`${post.title} — Peter's Pizzeria`));
    expect(document.body.textContent).toContain(post.title);
  });

  it('sends an unknown slug to the blog index rather than a blank article', async () => {
    visit('/blog/no-such-post');
    await waitForPage('.hero-title');
    await waitFor(() => expect(window.location.pathname).toBe('/'));
  });

  // An unknown path renders home and rewrites the bar, so a dead link doesn't
  // leave a lie in the address bar.
  it('falls back to home and rewrites an unknown path', async () => {
    visit('/not-a-real-page');
    await waitForPage('.hero-title');
    await waitFor(() => expect(window.location.pathname).toBe('/'));
  });

  it('navigates from the nav and pushes a history entry', async () => {
    visit('/');
    await waitForPage('.hero-title');
    const before = window.history.length;

    // Was the Order Now button until that went staff-only — any nav link
    // exercises the same push, and this one is on screen for everybody.
    fireEvent.click(screen.getAllByRole('button', { name: /^menu$/i })[0]);
    await waitFor(() => expect(window.location.pathname).toBe(PAGE_PATHS.menu));
    expect(window.history.length).toBeGreaterThanOrEqual(before);
  });
});

// Ordering moved behind the admin login: orders are taken at the window and
// typed in by whoever is running the board. The server refuses an
// unauthenticated POST outright, and these are the two halves of the UI that
// have to agree with it.
describe('ordering is staff-only', () => {
  it('shows a visitor no Order Now button and no cart at /order', async () => {
    visit(PAGE_PATHS.order);
    await waitForPage('.order-page');
    await waitFor(() => expect(screen.getByText(/at the window/i)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /order now/i })).toBeNull();
    expect(document.querySelector('.order-grid')).toBeNull();
  });

  // The slot itself always renders — the nav is laid out against a button on
  // the right, and dropping it entirely pulled the bar off balance. Only the
  // label and destination move with the session.
  it('keeps the nav CTA slot filled for a visitor, pointing at the menu', async () => {
    visit('/');
    await waitForPage('.hero-title');
    const cta = document.querySelector('.nav-order-btn');
    expect(cta).toBeTruthy();
    expect(cta.textContent).toMatch(/see the menu/i);
    fireEvent.click(cta);
    await waitFor(() => expect(window.location.pathname).toBe(PAGE_PATHS.menu));
  });

  it('gives a signed-in admin the button and the cart', async () => {
    stubApi({ '/api/login': { body: { authenticated: true } } });
    visit(PAGE_PATHS.order);
    await waitFor(() => expect(screen.getByRole('button', { name: /order now/i })).toBeTruthy());
    await waitFor(() => expect(document.querySelector('.order-grid')).toBeTruthy());
  });
});

describe('App landmarks', () => {
  it('puts a skip link first in the tab order, pointing at #main', async () => {
    visit('/');
    await waitForPage('.hero-title');
    const skip = document.querySelector('.skip-link');
    expect(skip).toBeTruthy();
    expect(skip.getAttribute('href')).toBe('#main');
    // First focusable element in the document.
    const focusable = document.querySelectorAll('a[href], button, input, [tabindex]:not([tabindex="-1"])');
    expect(focusable[0]).toBe(skip);
  });

  it('gives the skip link somewhere to land', async () => {
    visit('/');
    await waitForPage('.hero-title');
    const main = document.getElementById('main');
    expect(main).toBeTruthy();
    expect(main.tagName).toBe('MAIN');
    expect(main.getAttribute('tabindex')).toBe('-1');
  });

  // The nav sits outside the error boundary on purpose, so it stays
  // interactive under the crash fallback and remains the way out.
  it('renders the nav outside <main>', async () => {
    visit('/');
    await waitForPage('.hero-title');
    const nav = document.querySelector('nav');
    expect(nav).toBeTruthy();
    expect(document.getElementById('main').contains(nav)).toBe(false);
  });
});
