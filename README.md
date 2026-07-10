# Peter's Pizzeria

A student-run pizzeria website for Tufts University. Built with React 18, Vite, and Tailwind CSS.

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
- **React 18** — UI framework
- **Tailwind CSS v3** — utility classes; CSS custom properties handle brand colors
- **Custom CSS** — bespoke animations, pseudo-elements, and component classes live in `index.css`

## Photos

Photos live in `photos/` at the repo root and are served from `public/photos/` via a symlink. If you clone on Windows or the symlink breaks, copy the `photos/` folder into `public/`.

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
- **Safeguards**: per-IP + global rate limits on orders, login brute-force
  lockout, server-side price/item validation, unguessable order ids,
  security headers via `vercel.json`

### Production setup (Vercel)

1. `vercel integration add upstash` (or dashboard → Storage → Upstash Redis) —
   injects `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
2. Set `ADMIN_PASSWORD` in the project's environment variables — admin login
   refuses to work in production until this is set
3. Redeploy

Follow **@peterspizzeria_** on Instagram for weekly drop location and order
open announcements.
