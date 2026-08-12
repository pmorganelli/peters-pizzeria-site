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
npm test          # run the automated test suite (see Testing section below)
npm run test:watch
```

## Architecture

Client-side-only SPA with manual routing (no React Router). Page state lives in `App.jsx` and is persisted to `localStorage` as `pp_page2`.

### Routing

`App.jsx` holds `page` state (`'home' | 'menu' | 'blog' | 'article' | 'gallery' | 'studio' | 'order' | 'status' | 'slices' | 'admin'`). Adding a page means touching five places, each failing differently: `VALID_PAGES` (won't restore on refresh), the render switch (blank page), `Nav.jsx`'s `isDark` (unreadable nav on a dark hero), `Footer.jsx`'s `PAGES`, and the flex-column wrapper list in `index.css` (footer stops pinning to the bottom). `Nav.jsx`'s `PAGES` carries six links plus Order Now (`slices` shows as "Community Pictures") — the nav switches to the hamburger at 1080px instead of the page layouts' 768px to make room. The `nav(page, article?)` callback runs a directional transition (old page slides up/out, new page rises in, 260 ms). There is no URL bar routing — all navigation is in-memory. `admin` (order board) is a hidden page reachable from a footer-bottom button, not the nav. `studio` (share-card generator) has no UI entry point — reach it by setting `localStorage.pp_page2 = 'studio'` and refreshing. The nav's "Order Now" button goes to `order`.

### Ordering system

- **Customer** (`OrderPage.jsx`): cart built from `MENU_DATA` (qty steppers), persisted to localStorage (`pp_cart:v2`, `pp_who:v1`, `pp_order_id`; the older `pp_cart2` same-shape key and the legacy `pp_cart` {name: qty} shape are migrated on load); on submit → POST `/api/orders`; confirmation screen shows a pickup code and polls order status every 8s. Payment stays Venmo/Zelle at pickup — no payment processing.
- **Per-slice add-ons**: the Add Ons category has no standalone order rows — each slice unit in the cart carries its own add-on list (chips under the slice row, one row per unit). Cart shape: `{ [name]: string[][] }` (one addon-name array per unit); identical units group into API lines `{name, qty, addons?}`. The server validates add-ons (must exist, must be Add Ons category, only on Saturday Slices lines), prices them per unit, and stores them nested as `{name, priceCents}` on the item; `itemTotalCents()` in `src/utils/orders.js` is the shared line-total. `parsePriceCents` treats `'Free'` as 0 (an add-on priced 'Free' would otherwise be unorderable). Admin fire-next counts nested add-ons; status transitions out of `done`/`cancelled` are rejected (409).
- **Slice Status** (`StatusPage.jsx`, nav link "Slice Status"): public page that shows this device's in-flight order (via `pp_order_id`) with the same live card as the confirmation (`components/OrderStatusCard.jsx`, shared by both pages — green status banner + animated timeline). Without a saved order it shows a lookup form: `GET /api/orders?find=<code-or-name>` (rate-limited 30/IP/10min) matches pickup code exactly or name by full/first/prefix, preferring the newest active order; a hit saves the id locally and polling takes over. All public order reads (`?id=`, `?find=`) are sanitized — `contact`/`notes` never leave the server except on the admin board and the POST response.
- **Admin** (`AdminPage.jsx`): password login (POST `/api/login` → HMAC token in an HttpOnly cookie; client JS never sees it, `GET /api/login` reports session state); board polls `/api/orders` every 5s; columns New → In the oven → Ready with advance buttons (PATCH); "Fire next" panel aggregates pizza counts (add-ons dimmed) across `new` orders; tab title shows waiting count.
- **API** (`api/`): Vercel Node serverless functions. `api/_lib/` holds shared code (underscore = not routed). Prices are recomputed server-side from `src/data/menu.js` via `api/_lib/catalog.js` — clients never set prices. Storage (`api/_lib/store.js`): Upstash Redis when `UPSTASH_REDIS_REST_URL/TOKEN` (or `KV_REST_API_*`) env vars exist, else an in-memory Map (local dev). Orders expire after 3 days.
- **Auth**: `ADMIN_PASSWORD` env var; without it, login only works in dev mode (no Redis configured) with password `admin`, and refuses in production.
- **Store hours**: settings at Redis key `pp:settings` (`api/_lib/hours.js`) — `mode: open|closed|auto` plus a weekly window (day/start/end, ET). `GET /api/store` is public (order page shows a closed card); `PATCH` is admin (storefront panel on the board). Order creation is enforced server-side (403 when closed) — never rely on the client check alone.
- **Availability (86 list)**: `settings.unavailable` is an array of menu item names, toggled from the admin Availability panel (`PATCH /api/store {unavailable}`; names validated against the catalog). Sold-out items grey out on the homepage specials, menu page, and order page, and the API rejects them (400). Homepage specials are derived from menu items with a `special` field in `src/data/menu.js` — don't hardcode specials in `HomePage.jsx`.
- **Post your slice** (`SlicesPage.jsx`, nav link "Community Pictures" — also reached from the footer and from a CTA on `OrderStatusCard.jsx` once an order hits `ready`/`done`): public wall of customer photos. Storage is `api/_lib/slices.js` (`pp:slice:<id>`, `pp:slice-index`, `pp:slice-quota:<orderId>`; posts live 90 days, far longer than the 3-day order TTL). Images go to **Vercel Blob** (`BLOB_READ_WRITE_TOKEN`) via a server-side `put()` — never a browser-direct upload, so every check runs before any byte is stored. Posting requires an exact **pickup-code** match (never a name match — `?find=` in orders.js matches names, which would let anyone post as anyone) against a non-cancelled order; the window is bounded by the order TTL, so a code dies with its order at 3 days. 3 photos per order, claimed through an atomic Lua check-then-INCR (`claimSliceQuota`) and released if the upload fails. Uploads are JSON with a base64 data URL — deliberately not multipart, since `readBody()` is JSON-only and this reuses `api()` unchanged. Validation order: rate limit → `Content-Length` → decode → **magic-byte sniff** (the declared type is attacker-controlled) → quota → Blob. `imageMeta()` parses JPEG/PNG/WebP dimensions, which are stored so the wall can reserve each box with `aspect-ratio` (uploads aren't in the build-time `PHOTO_RATIOS`). Client downscales to 1600px via canvas, which also strips EXIF/GPS. Admin moderation panel offers Hide (unlists, reversible) and Delete (removes the blob — the only true removal, since a hidden photo's Blob URL stays reachable). **Self-delete**: a poster can remove their own photo. The upload stores `deviceHash` (sha256 of the browser's `pp_slice_device:v1` token) on the record; `DELETE /api/slices?id=` accepts either an admin cookie or a body `{device}` whose hash matches, compared with `timingSafeEqual`. `deviceHash` is stripped from both the public feed (`publicSlice`) and the admin board (`adminSlice`) — it never leaves the server. The client lists its own post ids in `pp_slice_mine:v1` purely to decide whether to *show* the button; editing that list gains nothing because the server verifies independently. Self-delete deliberately does **not** call `releaseSliceQuota` — the 3-per-order cap counts photos posted, not photos live, or post-delete-repeat would be an unlimited upload channel.
- **Rate limits** (`rateLimit()` in `api/_lib/store.js`, fixed-window on Redis INCR): orders 15/IP/10min (campus NAT puts dorms behind one IP) + 120 global/10min, login 8/IP/5min, slice uploads 5/IP/hr + 60 global/hr. Friendly 429 messages.
- **No-Redis guard**: on Vercel without Redis env vars, POST /api/orders returns 503 instead of silently storing orders in per-instance memory (where they'd vanish between cold starts).
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

## Testing

Automated tests use **Vitest** (`vitest.config.js`, `npm test` / `npm run test:watch`). Test files are colocated with the code they cover (`foo.js` → `foo.test.js`), not gathered in a separate tree — keep new tests next to the source when adding coverage. Shared test infrastructure lives in `tests/helpers/`:

- `server.js` — mounts real `api/` handlers on an ephemeral `http` server (mirrors `scripts/dev-api.mjs`) so handler tests hit them with real `fetch()` calls — real headers, streaming bodies, cookies — instead of hand-rolled req/res mocks.
- `env.js` — `resetEnv()` clears Redis/Blob/admin env vars and the in-memory store Maps between tests. **Those Maps are captured in module-top-level `const`s in `api/_lib/slices.js` and `api/_lib/store.js`, read once at first import** — clearing state means calling `.clear()` on the existing Map, not deleting the `globalThis` key and hoping it gets recreated (it won't, within one test file's module registry). Get this wrong and tests pass individually but leak state into their neighbors.
- `fixtures.js` — `placeOrder()`/`adminCookie()` drive real orders and admin sessions through the real handlers; `insertOrder()` writes a synthetic order straight into the store for edge cases (expired, cancelled) that can't be produced deterministically without faking the clock.
- `images.js` — byte-exact minimal JPEG/PNG/WebP buffers built directly from `imageMeta()`'s own parsing offsets in `api/slices.js`, not sourced from real image files. If that parser's byte layout ever changes, these fixtures need to change with it.

**What's covered**: all four `api/slices.js` handler branches (auth, quota, rate limits, magic-byte image sniffing, admin moderation, self-delete device auth), the `api/_lib/slices.js` storage layer, and the pure helpers in `src/utils/*.js` (extracted out of page components specifically so they're importable without dragging in React/GSAP/lucide-react — see `src/utils/slices.js`).

**What's deliberately not covered** (and shouldn't block a PR): the Redis-backed storage path (Lua atomicity, TTL/expiry, list trimming — tests run with no Redis env vars, exercising the same in-memory fallback as local dev), real `@vercel/blob` network calls (mocked via `vi.mock`), and anything requiring a real browser (camera capture, HEIC handling, touch/visibility behavior, actual masonry layout). Those are tracked as a living checklist in **`TESTING.md`** — add to it, don't let it go stale, whenever a feature needed manual poking to trust.

When adding a new API route or a new piece of client logic with real branching, add tests alongside it following this same pattern (real handler + real in-memory store > mocking internals) rather than skipping coverage because "there's no test setup yet" — there is now.

`.github/workflows/test.yml` runs `npm test` and `npm run build` on every PR and on push to `main`. A test that never fails when the logic it claims to cover is broken is worse than no test — when in doubt, prove a new test actually catches the bug it's meant to catch (temporarily break the source, confirm red, revert) rather than trusting that green means correct.

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
