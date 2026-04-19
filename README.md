# Peter's Pizzeria

A student-run pizzeria website for Tufts University. Built with React 18, Vite, and Tailwind CSS.

## Running locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

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

## Ordering

Payment via Venmo `@Peter-Morganelli24` or Zelle. Follow **@peterspizzeria** on Instagram for weekly drop location and order open announcements.
