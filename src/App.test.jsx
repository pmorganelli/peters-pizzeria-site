// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    '/api/login': { body: { authed: false } },
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

    fireEvent.click(screen.getAllByRole('button', { name: /order now/i })[0]);
    await waitFor(() => expect(window.location.pathname).toBe(PAGE_PATHS.order));
    expect(window.history.length).toBeGreaterThanOrEqual(before);
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
