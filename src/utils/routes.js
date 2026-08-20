// Extension is explicit (the rest of the app omits it) because
// scripts/gen-sitemap.mjs imports this module through plain Node ESM at build
// time, and Node won't guess it the way Vite does.
import { BLOG_POSTS } from '../data/posts.js';

// The URL is the source of truth for which page is showing. Everything here is
// pure and React-free so the mapping can be tested on its own (same reasoning
// as the other src/utils modules).

// Page id → path. Every id in App's VALID_PAGES needs an entry; a page without
// one has no address, which is the whole bug this replaced. 'article' is absent
// on purpose — it's the only page whose path carries data (see pathForRoute).
export const PAGE_PATHS = {
  home:    '/',
  menu:    '/menu',
  blog:    '/blog',
  gallery: '/gallery',
  studio:  '/studio',
  order:   '/order',
  status:  '/status',
  slices:  '/slices',
  admin:   '/admin',
  nights:  '/admin/nights',
};

const PATH_PAGES = Object.fromEntries(
  Object.entries(PAGE_PATHS).map(([page, path]) => [path, page])
);

// Titles for the tab and for history entries. Home is the bare site name.
export const PAGE_TITLES = {
  home:    "Peter's Pizzeria",
  menu:    "Menu — Peter's Pizzeria",
  blog:    "Blog — Peter's Pizzeria",
  gallery: "Gallery — Peter's Pizzeria",
  studio:  "Share Card — Peter's Pizzeria",
  order:   "Order — Peter's Pizzeria",
  status:  "Slice Status — Peter's Pizzeria",
  slices:  "Community Pictures — Peter's Pizzeria",
  admin:   "Admin — Peter's Pizzeria",
  nights:  "Past Nights — Peter's Pizzeria",
};

// Apostrophes are dropped rather than turned into separators, so "Peter's"
// slugs to `peters` and not `peter-s`.
export function slugify(title) {
  return String(title)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['\u2018\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// One definition of a post's slug, used to build the path and to match it back.
// A hand-written `slug` wins over the title so the URL can stay short and stable
// while the headline is still free to change.
export function postSlug(post) {
  return post.slug || slugify(post.title);
}

export function articlePath(post) {
  return `/blog/${postSlug(post)}`;
}

export function pathForRoute(page, article = null) {
  if (page === 'article') return article ? articlePath(article) : PAGE_PATHS.blog;
  return PAGE_PATHS[page] || PAGE_PATHS.home;
}

export function titleForRoute(page, article = null) {
  if (page === 'article') {
    return article ? `${article.title} — Peter's Pizzeria` : PAGE_TITLES.blog;
  }
  return PAGE_TITLES[page] || PAGE_TITLES.home;
}

// pathname → {page, article} | null. Null means "no such page here" so the
// caller can decide (App canonicalises to home rather than showing a dead end).
// The query string and hash are the caller's to strip; only a pathname is read,
// which is what keeps the skip link's `#main` from looking like a route.
export function routeFromPath(pathname) {
  let path = String(pathname || '/').split('?')[0].split('#')[0].toLowerCase();
  // Trailing slashes are equivalent, but '/' itself must survive the trim.
  if (path.length > 1) path = path.replace(/\/+$/, '');
  if (!path) path = '/';

  if (PATH_PAGES[path]) return { page: PATH_PAGES[path], article: null };

  if (path.startsWith('/blog/')) {
    const slug = path.slice('/blog/'.length);
    // Resolved by slug rather than index, so reordering BLOG_POSTS doesn't
    // silently repoint every link that's already been shared.
    const post = BLOG_POSTS.find((p) => postSlug(p) === slug);
    return post ? { page: 'article', article: post } : null;
  }

  return null;
}
