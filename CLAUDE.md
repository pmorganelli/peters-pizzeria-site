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

`App.jsx` holds `page` state (`'home' | 'menu' | 'blog' | 'article' | 'gallery' | 'studio'`). The `nav(page, article?)` callback runs a directional transition (old page slides up/out, new page rises in, 260 ms). There is no URL bar routing — all navigation is in-memory. `studio` is a hidden page (share-card generator) reachable from the footer-bottom "Studio" button, not the nav.

### Lightbox

Global lightbox state (`lbPhotos`, `lbIndex`, `lbOpen`) lives in `App.jsx`. Any page can call `openLightbox(photosArray, startIndex)`. Keyboard (←/→/Esc) and touch swipe are handled inside `Lightbox.jsx`.

### Animation (GSAP)

Animations run on GSAP (`gsap` + `@gsap/react`, all plugins free since the Webflow acquisition):

- `useScrollReveal` stamps the `reveal` class and drives the rise-in with a ScrollTrigger tween per element (`once: true`); on complete it adds `revealed` and clears inline styles so CSS hover transforms still work. `reveal-delay-N` classes are stagger markers read by the hook — they carry no CSS. Each page uses a fresh instance of the hook (component unmounts on page change).
- `LineReveal.jsx` uses the SplitText plugin (`type: 'lines'`, masked, `autoSplit`) for staggered per-line title reveals — article titles, blog hero sub.
- Home and blog hero backgrounds have a scrubbed ScrollTrigger parallax (`HomePage.jsx` / `BlogPage.jsx`); their CSS `inset` extends past the top so the drift never exposes an edge.
- Every GSAP effect is skipped under `prefers-reduced-motion` (the CSS reduced-motion block makes `.reveal` content visible).

The home hero entrance and the nav hamburger remain plain CSS animations — don't port them to GSAP.

### Icons

UI icons (arrows, chevrons, close, at-sign) come from `lucide-react`. Note: Lucide has removed brand icons (Instagram etc.), so social links use generic glyphs. The nav hamburger and the logo badge are not Lucide.

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

### Derivatives

`photos/thumbs/` (max 640px) and `photos/web/` (max 1600px) are generated from the originals by `scripts/gen-photo-derivatives.sh` (macOS `sips`, no deps; skips files that already exist). After adding new photos, re-run the script. Code never hardcodes derivative paths — use `thumbSrc(src)` / `webSrc(src)` from `src/utils/photos.js`. Grids/cards use thumbs, article bodies and the lightbox use web (lightbox `srcset` upgrades to the original on large screens).

## Text layout (Pretext)

`@chenglou/pretext` measures text without DOM reflow. Used in one place: `src/pages/StudioPage.jsx` (wraps the headline for the 1080×1350 canvas share card), falling back to plain text if measurement fails. (`LineReveal.jsx` previously used it too but now splits lines with GSAP SplitText.)

## Known bugs fixed

- `BlogPage.jsx`: original HTML had garbled text `JournlAlign:'middle'}}/>Journal` in the section label. Fixed to just `Journal`.

## Things to keep in mind

- This is a personal/student project — keep changes simple and non-breaking.
- The site has no backend; ordering is handled via Venmo/Zelle communicated through the menu page.
- The `pp_page2` localStorage key preserves the last-visited page across refreshes. The key name (`pp_page2`) is intentional (legacy from original file).
