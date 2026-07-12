# CLAUDE.md — Peter's Pizzeria

## What this project is

A single-page React app for Peter's Pizzeria, a student-run pizza operation. Mostly a static marketing site, plus a small ordering system: customers place orders from the menu, staff manage them on a live admin board. The only backend is the `api/` folder of Vercel serverless functions.

## How to run

```bash
npm install
npm run dev       # dev server at http://localhost:5173
npm run dev:api   # order API on :3010 (run in a second terminal; Vite proxies /api)
npm run build     # production build → dist/
npm run preview   # serve dist/ locally
```

## Architecture

Client-side-only SPA with manual routing (no React Router). Page state lives in `App.jsx` and is persisted to `localStorage` as `pp_page2`.

### Routing

`App.jsx` holds `page` state (`'home' | 'menu' | 'blog' | 'article' | 'gallery' | 'studio' | 'order' | 'status' | 'admin'`). The `nav(page, article?)` callback runs a directional transition (old page slides up/out, new page rises in, 260 ms). There is no URL bar routing — all navigation is in-memory. `admin` (order board) is a hidden page reachable from a footer-bottom button, not the nav. `studio` (share-card generator) has no UI entry point — reach it by setting `localStorage.pp_page2 = 'studio'` and refreshing. The nav's "Order Now" button goes to `order`.

### Ordering system

- **Customer** (`OrderPage.jsx`): cart built from `MENU_DATA` (qty steppers), persisted to localStorage (`pp_cart`, `pp_who`, `pp_order_id`); on submit → POST `/api/orders`; confirmation screen shows a pickup code and polls order status every 8s. Payment stays Venmo/Zelle at pickup — no payment processing.
- **Slice Status** (`StatusPage.jsx`, nav link "Slice Status"): public page that shows this device's in-flight order (via `pp_order_id`) with the same live card as the confirmation (`components/OrderStatusCard.jsx`, shared by both pages — green status banner + animated timeline). Without a saved order it shows a lookup form: `GET /api/orders?find=<code-or-name>` (rate-limited 30/IP/10min) matches pickup code exactly or name by full/first/prefix, preferring the newest active order; a hit saves the id locally and polling takes over. All public order reads (`?id=`, `?find=`) are sanitized — `contact`/`notes` never leave the server except on the admin board and the POST response.
- **Admin** (`AdminPage.jsx`): password login (POST `/api/login` → HMAC token in localStorage `pp_admin_token`); board polls `/api/orders` every 5s; columns New → In the oven → Ready with advance buttons (PATCH); "Fire next" panel aggregates pizza counts (add-ons dimmed) across `new` orders; tab title shows waiting count.
- **API** (`api/`): Vercel Node serverless functions. `api/_lib/` holds shared code (underscore = not routed). Prices are recomputed server-side from `src/data/menu.js` via `api/_lib/catalog.js` — clients never set prices. Storage (`api/_lib/store.js`): Upstash Redis when `UPSTASH_REDIS_REST_URL/TOKEN` (or `KV_REST_API_*`) env vars exist, else an in-memory Map (local dev). Orders expire after 3 days.
- **Auth**: `ADMIN_PASSWORD` env var; without it, login only works in dev mode (no Redis configured) with password `admin`, and refuses in production.
- **Store hours**: settings at Redis key `pp:settings` (`api/_lib/hours.js`) — `mode: open|closed|auto` plus a weekly window (day/start/end, ET). `GET /api/store` is public (order page shows a closed card); `PATCH` is admin (storefront panel on the board). Order creation is enforced server-side (403 when closed) — never rely on the client check alone.
- **Availability (86 list)**: `settings.unavailable` is an array of menu item names, toggled from the admin Availability panel (`PATCH /api/store {unavailable}`; names validated against the catalog). Sold-out items grey out on the homepage specials, menu page, and order page, and the API rejects them (400). Homepage specials are derived from menu items with a `special` field in `src/data/menu.js` — don't hardcode specials in `HomePage.jsx`.
- **Rate limits** (`rateLimit()` in `api/_lib/store.js`, fixed-window on Redis INCR): orders 5/IP/10min + 120 global/10min, login 8/IP/5min. Friendly 429 messages.
- **Security posture**: secrets never reach the client (no `VITE_` prefixed secrets, verified against `dist/`); order totals are server-computed; order ids are 10 random bytes (they act as the customer's status read-token); security headers in `vercel.json`. No load balancer needed — Vercel's edge handles that.
- **Local dev**: `scripts/dev-api.mjs` mounts the same handlers on :3010; `vite.config.js` proxies `/api` there. Handlers must stay runtime-agnostic (use `readBody`/`readQuery` from `api/_lib/util.js`, not Vercel's `req.body`/`req.query`).
- **Deploy**: `vercel integration add upstash` + set `ADMIN_PASSWORD` in Vercel env vars.

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

- `src/data/menu.js` — menu categories and items (update prices/items here); an item's optional `special: '<tag>'` field puts it on the homepage specials strip
- `src/data/posts.js` — blog posts array + `ALL_PHOTOS` array for the gallery

Both are plain JS arrays — no API calls. To add a post, append to `BLOG_POSTS`. To add gallery photos, append paths to `ALL_PHOTOS`.

## Photos

Photos are served from `public/photos/` which is a symlink to `../photos/` (the repo-root `photos/` folder). On Windows or if the symlink is broken, copy `photos/` into `public/`.

All image paths in code use the `/photos/filename` convention (Vite resolves `public/` as root).

### Derivatives

`photos/thumbs/` (max 640px) and `photos/web/` (max 1600px) are generated from the originals by `scripts/gen-photo-derivatives.sh` (macOS `sips`, no deps; skips files that already exist). The script also runs `scripts/gen-photo-dims.mjs`, which regenerates `src/data/photoDims.js` (`PHOTO_RATIOS`: photo path → `w/h`); the gallery uses it to reserve each image's box via `aspect-ratio` so the masonry never reflows while photos load. After adding new photos, re-run the script. Code never hardcodes derivative paths — use `thumbSrc(src)` / `webSrc(src)` from `src/utils/photos.js`. Grids/cards use thumbs, article bodies and the lightbox use web (lightbox `srcset` upgrades to the original on large screens).

## Text layout (Pretext)

`@chenglou/pretext` measures text without DOM reflow. Used in one place: `src/pages/StudioPage.jsx` (wraps the headline for the 1080×1350 canvas share card), falling back to plain text if measurement fails. (`LineReveal.jsx` previously used it too but now splits lines with GSAP SplitText.)

## Known bugs fixed

- `BlogPage.jsx`: original HTML had garbled text `JournlAlign:'middle'}}/>Journal` in the section label. Fixed to just `Journal`.

## Things to keep in mind

- This is a personal/student project — keep changes simple and non-breaking.
- The site has no backend; ordering is handled via Venmo/Zelle communicated through the menu page.
- The `pp_page2` localStorage key preserves the last-visited page across refreshes. The key name (`pp_page2`) is intentional (legacy from original file).
