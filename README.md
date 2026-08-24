# Peter's Pizzeria

A student-run pizzeria website. Built with React 19, Vite, and Tailwind CSS.

## Running locally

```bash
npm install
npm run dev        # site at http://localhost:5173
npm run dev:api    # order API (separate terminal) — Vite proxies /api to it
```

Open `http://localhost:5173` in your browser. Locally the order API keeps
orders in memory (restart clears them) and the admin password is `admin`.

## Building for production

```bash
npm run build      # outputs to dist/
npm run preview    # serves the dist/ build locally
```

## Tests

```bash
npm test           # full suite, once
npm run test:watch # re-run on change
npm run doctor     # react-doctor: lint, a11y, bundle, architecture
```

Handler and pure-logic tests run under plain Node; component tests render in
jsdom and opt in per file. The component harness fails any test that writes to
`console.error`/`console.warn`, so a React key warning or an unknown DOM
property is a build failure rather than console noise nobody reads.

`npm test` and `npm run build` also run on every PR and on push to `main`
(`.github/workflows/test.yml`). See `TESTING.md` for the manual checklist
covering what a headless suite can't reach — real cameras, real uploads, real
devices.

## Project structure

```
src/
├── components/
│   ├── LogoBadge.jsx    # SVG pizza-badge logo
│   ├── Nav.jsx          # Fixed nav with scroll effect + mobile hamburger
│   ├── Footer.jsx       # Site-wide footer
│   └── Lightbox.jsx     # Full-screen photo lightbox (keyboard + swipe)
├── pages/
│   ├── HomePage.jsx     # Hero, story, specials, blog preview, community section
│   ├── MenuPage.jsx     # Full menu with categories
│   ├── BlogPage.jsx     # Blog post grid
│   ├── ArticlePage.jsx  # Single article view with recipe boxes
│   └── GalleryPage.jsx  # Masonry photo gallery
├── data/
│   ├── menu.js          # Menu categories and items
│   └── posts.js         # Blog posts + ALL_PHOTOS list
├── hooks/
│   ├── useScrolled.js       # Returns true when page is scrolled > threshold
│   └── useScrollReveal.js   # IntersectionObserver-based reveal animation
├── App.jsx       # Root component: routing, lightbox state, page transitions
├── main.jsx      # React entry point
└── index.css     # CSS variables, custom classes, Tailwind layers
```

## Tech stack

- **Vite** — build tool and dev server
- **React 19** — UI framework
- **Tailwind CSS v3** — utility classes; CSS custom properties handle brand colors
- **Vitest + Testing Library** — automated tests (`npm test`)
- **Custom CSS** — bespoke animations, pseudo-elements, and component classes live in `index.css`

## Photos

Photos live in `photos/` at the repo root and are served from `public/photos/` via a symlink. If you clone on Windows or the symlink breaks, copy the `photos/` folder into `public/`.

### Adding photos to the gallery

1. Drop the new image files into `photos/` (or `photos/bambinoPictures/`).
2. Run `bash scripts/gen-photo-derivatives.sh` — it generates `thumbs/` (max 640px) and `web/` (max 1600px) derivatives and regenerates `src/data/photoDims.js` (the aspect ratios the gallery uses to reserve layout space). It skips files that already have derivatives, so it's safe to re-run.
3. Add each new file's `/photos/<filename>` path to the `ALL_PHOTOS` array in `src/data/posts.js` — that's what makes it show up in the gallery.

## Ordering system

Customers hit **Order Now**, build a cart from the menu, and place an order
(no online payment — Venmo `@Peter-Morganelli24` or Zelle at pickup). They get
a pickup code and a live status screen. Staff open **Admin** (footer link),
log in, and get a live board — New / In the oven / Ready columns plus a
"Fire next" panel that aggregates which pizzas to fire across waiting orders.

- `api/` — Vercel serverless functions (`orders`, `login`, `store`); prices are
  always recomputed server-side from `src/data/menu.js`
- Orders are stored in **Upstash Redis** in production and in memory during
  local dev; they expire after 3 days
- **Store hours**: the admin board has a Storefront panel — force Open, force
  Closed, or follow a weekly schedule (default Saturdays 7:00–8:30 PM ET).
  When closed, the order page shows the next window and the API rejects
  order attempts
- **Availability**: tap any item on the admin board's Availability panel to
  86 it — it greys out on the homepage specials, menu, and order page, and
  can't be ordered until you tap it back on. Homepage specials come from
  menu items tagged `special` in `src/data/menu.js`
- **Post your slice**: customers put a photo of themselves with their pizza on
  a public wall that updates live. Posting needs the pickup code from a real
  order (3 photos per order, code good for as long as the order lives — 3
  days); photos go up instantly and are taken down from the admin board's
  Slice wall panel, which offers Hide (reversible) and Delete (permanent).
  Posters can also delete their own photo from the wall, on the device they
  posted it from
- **Safeguards**: per-IP + global rate limits on orders, uploads and login,
  brute-force lockout, server-side price/item validation, unguessable order
  ids, uploads validated by magic bytes and capped in size,
  security headers via `vercel.json`

### Production setup (Vercel)

1. `vercel integration add upstash` (or dashboard → Storage → Upstash Redis) —
   injects `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
2. Set `ADMIN_PASSWORD` in the project's environment variables — admin login
   refuses to work in production until this is set
3. Create a Blob store (dashboard → Storage → Blob, or `vercel blob store add`)
   — injects `BLOB_READ_WRITE_TOKEN`, which the slice wall needs. Without it
   the wall still displays, but posting returns a friendly 503
4. Redeploy

### Keeping dependencies current

Dependabot opens grouped PRs weekly (`.github/dependabot.yml`). Minor and patch
bumps arrive batched — one PR for runtime, one for tooling — while majors come
one at a time with their own changelog to read. Two pairs are grouped so they
can never split apart, because they're locked together by peer ranges and
`npm ci` fails outright if they move independently: `react` + `react-dom`, and
`vite` + `@vitejs/plugin-react`.

Every PR runs the full suite and a preview deploy, so a bad bump is red before
it can merge. Two things Dependabot won't do for you: it never touches the
`overrides` block in `package.json` (check `npm ls <pkg>` after a major on
anything owning pinned transitives), and Tailwind majors are ignored on purpose
— v4 is a migration, not a bump.

Follow **@peterspizzeria_** on Instagram for weekly drop location and order
open announcements.
