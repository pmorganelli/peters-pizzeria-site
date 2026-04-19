# CLAUDE.md — Peter's Pizzeria

## What this project is

A single-page React app for Peter's Pizzeria, a student-run pizza operation at Tufts University (Medford, MA). It is a public-facing marketing and ordering website — no backend, no auth, no database. Everything is static.

## How to run

```bash
npm install
npm run dev       # dev server at http://localhost:5173
npm run build     # production build → dist/
npm run preview   # serve dist/ locally
```

## Architecture

Client-side-only SPA with manual routing (no React Router). Page state lives in `App.jsx` and is persisted to `localStorage` as `pp_page2`.

### Routing

`App.jsx` holds `page` state (`'home' | 'menu' | 'blog' | 'article' | 'gallery'`). The `nav(page, article?)` callback fades out, swaps state, fades back in (260 ms). There is no URL bar routing — all navigation is in-memory.

### Lightbox

Global lightbox state (`lbPhotos`, `lbIndex`, `lbOpen`) lives in `App.jsx`. Any page can call `openLightbox(photosArray, startIndex)`. Keyboard (←/→/Esc) and touch swipe are handled inside `Lightbox.jsx`.

### Scroll reveal

`useScrollReveal` stamps `reveal` class on elements at render time and adds `revealed` via `IntersectionObserver`. The CSS transition then fires. Each page uses a fresh instance of the hook (component unmounts on page change).

## Styling

- Brand colors, fonts, and all custom component classes live in `src/index.css`.
- Tailwind CSS is present and available for utilities; the Tailwind config maps `text-red`, `bg-cream`, etc. to CSS custom properties so both systems stay in sync.
- Never remove the CSS custom property block at the top of `index.css` — it is the single source of truth for all brand values.

## Data

- `src/data/menu.js` — menu categories and items (update prices/items here)
- `src/data/posts.js` — blog posts array + `ALL_PHOTOS` array for the gallery

Both are plain JS arrays — no API calls. To add a post, append to `BLOG_POSTS`. To add gallery photos, append paths to `ALL_PHOTOS`.

## Photos

Photos are served from `public/photos/` which is a symlink to `../photos/` (the repo-root `photos/` folder). On Windows or if the symlink is broken, copy `photos/` into `public/`.

All image paths in code use the `/photos/filename` convention (Vite resolves `public/` as root).

## Known bugs fixed

- `BlogPage.jsx`: original HTML had garbled text `JournlAlign:'middle'}}/>Journal` in the section label. Fixed to just `Journal`.

## Things to keep in mind

- This is a personal/student project — keep changes simple and non-breaking.
- The site has no backend; ordering is handled via Venmo/Zelle communicated through the menu page.
- The `pp_page2` localStorage key preserves the last-visited page across refreshes. The key name (`pp_page2`) is intentional (legacy from original file).
