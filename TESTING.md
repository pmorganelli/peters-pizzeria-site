# Testing

Automated coverage lives next to the code it tests (`*.test.js` for handlers and
pure logic, `*.test.jsx` for components, all run via `npm test`). This file is
the other half: a running checklist of things that can't be asserted cheaply in
Vitest — real browser behavior, real file uploads, real devices — kept here so
it survives across features instead of living in someone's head. Add to it
whenever you ship something that needed manual poking to trust.

**Before adding an item, check it isn't already automated.** Components now
render in jsdom, so routing, add-on chip behaviour, quantity caps, sold-out
states, lightbox keyboard nav and the crash fallback are covered by the suite
and don't need a manual pass. What jsdom can't do is *layout* — it computes no
CSS grid, no real font metrics, no viewport — so anything about how something
looks at a given width still belongs here.

See CLAUDE.md's **Testing** section for how the automated suite is organized
and what it deliberately doesn't cover.

## Post your slice (`SlicesPage.jsx`, `api/slices.js`)

Run `npm run dev` + `npm run dev:api` with a real `BLOB_READ_WRITE_TOKEN` in
`.env.local` before working through this list — the automated suite mocks
`@vercel/blob` entirely, so it never touches real storage.

- [ ] Full journey: place a real order → note the pickup code → open Slice
      Status once the order is `ready`/`done` → tap the CTA → composer opens
      prefilled with the code/name → post a photo → it appears on `/slices`.
- [ ] Tap "Take a photo or choose from library" on iOS Safari and Android
      Chrome and confirm the native sheet offers *both* the camera and the
      photo library. There's no `capture` attribute on the input specifically
      so the OS shows both — if only a file browser appears, that's the
      regression to catch.
- [ ] Post a HEIC photo straight from an iPhone photo library (not the
      camera). If the browser doesn't transcode it to JPEG before it reaches
      `downscaleImage()`, confirm what error the customer actually sees —
      `imageMeta()` only recognizes JPEG/PNG/WebP.
- [ ] Post an extremely wide and an extremely tall photo; confirm the wall's
      masonry doesn't reflow or leave a gap (`aspect-ratio` is reserved from
      the server-reported `w`/`h`).
- [ ] Self-delete: post from one device, confirm the delete button does
      *not* appear on a second device/browser for the same photo, and that a
      `DELETE` with a guessed/wrong device value 403s.
- [ ] Leave the wall open in a background tab for a few minutes, confirm
      polling stops (`visibilitychange`), then refocus and confirm it
      catches up immediately.
- [ ] Trigger the real per-IP rate limit (5 uploads/hour) and read the
      actual message shown in the composer.
- [ ] Admin board: hide a post (confirm it drops off the public wall but
      stays in the admin list), restore it, then delete it for real and
      confirm the Blob URL 404s afterward.
- [ ] Post 3 photos on one order, confirm the composer/API refuses a 4th
      with the "already posted its 3 photos" message.
- [ ] Try posting with a pickup code from an order placed more than 3 days
      ago (or edit an order's timestamp in Redis for a staging check) and
      confirm the generic "did not match" message — not a different message
      that would hint the code was once valid.

## Takedown requests (`api/reports.js`, admin `ReportsPanel`)

- [ ] From a browser that has never posted (or a private window), flag a
      photo and confirm the panel appears at the top of the admin board
      within one 5s poll — and that it was *not* there before.
- [ ] With the board **scrolled down to the order columns**, have someone
      flag a photo: the header alert should appear and pulse without you
      scrolling, and clicking it should jump to the panel. This is the case
      the panel alone doesn't cover.
- [ ] With the board in a **background tab**, flag a photo and confirm the
      tab title picks up the `⚑`.
- [ ] The flag button is hidden for admins, so send the test request from a
      logged-out browser or private window — reporting from the same browser
      you're logged into as admin will show a delete button, not a flag.
- [ ] Confirm the flag button does **not** appear on your own photo, or on
      any photo while logged in as admin (both already show delete instead).
- [ ] "Keep it" removes the row but leaves the photo on the wall; reload
      both pages and confirm it stays that way.
- [ ] "Take it down" removes the row *and* the photo, and the Blob URL 404s.
- [ ] Flag the same photo from two different browsers and confirm the panel
      reads "2 people asked" rather than showing two rows.
- [ ] On a phone, confirm the flag button is visible without hovering (the
      desktop styling reveals it on hover; `@media (hover: none)` should pin
      it visible on touch).

## Past nights archive (`NightsArchivePage.jsx`, `api/nights.js`)

Deleting a night is permanent and there's no undo, so the guard around it is
the part worth poking by hand — the handler itself is covered in
`api/nights.test.js`.

- [ ] Arm a night's delete button (first click), then click elsewhere on the
      page and confirm it disarms rather than staying primed for a stray
      second click later.
- [ ] Delete an expanded night and confirm the detail panel closes with it
      instead of leaving an orphaned open row.
- [ ] Two-tab check: open the archive in two tabs, delete a night in one,
      then delete the same night in the other — the second should surface the
      "no longer in the archive" error and resync the list, not fail silently.
- [ ] Narrow phone width: confirm the delete button stays on-screen and the
      date/total row doesn't push it off the right edge.
- [ ] Before opening for real: close a test night, confirm it appears with the
      right total, delete it, and confirm the archive reads empty.

## Add-on chips (`OrderPage.jsx`, `.addon-unit-chips`)

`OrderPage.test.jsx` covers the *behaviour* — one chip per add-on, toggling,
per-unit independence, prices, aria-labels. None of it covers **layout**: jsdom
computes no grid tracks and no font metrics, so everything below needs a real
browser. The grid is a fixed `repeat(2, minmax(0, 1fr))` at every width; see
CLAUDE.md for why two and not four.

- [ ] Sweep the width from desktop down to 320px and confirm the block stays
      2×2 the whole way — never 1 across, never 3, and never overflowing its
      row. `body { overflow-x: hidden }` would hide an overflow, so check the
      chip grid's own `scrollWidth` against its `clientWidth` rather than
      trusting the eye.
- [ ] At or below ~390px (iPhone 14/SE, most Androids) the longest label
      ("Extra Stracciatella" on Chef's Choice) wraps to two balanced lines.
      That's expected and accepted — all four chips stretch to the same height,
      so the row stays aligned. What would be a bug: an ellipsis, a chip taller
      than its neighbours, or the price splitting off its sign.
- [ ] On a real phone, confirm a single-line chip is roughly a 44px touch
      target and that two adjacent chips can be told apart by thumb.
- [ ] Toggle a chip on and check the selected (green) state: white label, price
      still legible beneath it at 0.85 opacity.
- [ ] Check a slice whose description already names the add-on (Chef's Choice
      has stracciatella) against one that doesn't (Cheese Slice) — the first
      should read "Extra Stracciatella", the second just "Stracciatella".
      That's `addonLabel()`, and it changes the longest string on the page.
- [ ] 86 an add-on from the admin Availability panel and confirm the chip goes
      struck-through and unclickable without changing the grid shape.

## General regression pass (any change touching ordering/admin)

- [ ] Full order → admin board → status advance → pickup flow, once, in a
      real browser.
- [ ] `npm run doctor` (react-doctor) reports **no findings at all**. The gate
      used to be "no new findings beyond a known baseline"; the baseline is
      empty now, so any finding is a new one.

## Self-hosted fonts and the CSP

The webfonts moved from Google Fonts to `public/fonts/` (see the `@font-face`
block at the top of `src/index.css`). jsdom has no font metrics and
`vercel.json` headers don't apply locally, so none of this is reachable from
the automated suite — and both failure modes are silent, which is the reason
they're listed here rather than trusted.

- [ ] Load the site with a cold cache and confirm headlines render in Fraunces,
      not a fallback serif. A 404 on a font file doesn't throw anything — the
      page just quietly sets in Times.
- [ ] DevTools → Network, filter to Font: exactly **two** files should download
      on a plain English page (`fraunces-latin`, `inter-latin`). If a `-ext`
      file loads too, a stray character is pulling in latin-ext.
- [ ] Confirm **no** request goes to `fonts.googleapis.com` or
      `fonts.gstatic.com`. One means a `<link>` or `@import` came back, and the
      tightened CSP will now block it.
- [ ] Check the two preloaded fonts aren't downloaded twice (one preload + one
      CSS fetch in the Network panel means the `crossorigin` attribute was
      dropped from the `<link rel="preload">`).
- [ ] Test the CSP change the way CLAUDE.md describes — inject it as a
      `<meta http-equiv>` into `dist/index.html` and run `npm run preview`,
      since `vercel.json` headers don't apply locally. Watch the console for
      violations: `font-src 'self'` and `style-src` no longer allow Google.
- [ ] Type an accented name (e.g. `José`) into the pickup-name field and
      confirm it renders rather than showing tofu — that's the latin-ext
      subset doing its job.

## Route code splitting (`App.jsx`)

Admin, nights, studio and slices load as separate chunks now.

- [ ] Navigate to each of those four pages on a throttled connection and
      confirm the page appears rather than collapsing — `.route-loading`
      reserves the height while the chunk downloads.
- [ ] Hard-refresh directly on `/slices` and `/admin` (deep link, not a
      client-side nav) and confirm both still render.
- [ ] After a redeploy, an open tab navigating to a lazy route requests a
      chunk hash that no longer exists. Confirm that surfaces as the
      ErrorBoundary crash page, not a blank screen. Note the request does
      **not** 404 visibly — the stale chunk URL matches the SPA rewrite, so the
      browser gets `index.html` back and the import fails on MIME type instead.
- [ ] From that crash page, press **Back to home**, then navigate to the same
      lazy route again. It must load. `React.lazy` caches a rejected import,
      so if the escape hatch is ever changed back to a client-side `nav()` the
      route stays broken for the rest of the session and this is the check
      that catches it.

## Order page layout reservation (`.order-gate`)

- [ ] Throttle to Slow 3G and load `/order`. The footer should sit below the
      fold from the first paint and **not** jump when the menu appears. This is
      the 0.70 → 0.00 CLS fix; it regresses silently if the wrapper is removed.
- [ ] Repeat with the store **closed** — the short closed card must not pull
      the footer back up.

## Photos and Image Optimization

Every `<img>` goes through `/_vercel/image`, **which only exists on Vercel** —
`vite dev` and `vite preview` fall back to the plain `photos/large/` file (see
`optimizerAvailable()` in `src/utils/photos.js`). So none of this can be
verified locally; check it on a preview deployment after any change to
`vercel.json`'s `images` block, `OPTIMIZER_WIDTHS`, or the src helpers.

- [ ] Gallery, home, blog, article and menu photos all load — a `w` or `q` that
      isn't allow-listed in `vercel.json` returns an error, not an image, and
      only in production. (`photos.test.js` guards the lists against drift, but
      it can't catch a `localPatterns` regex that fails to match.)
- [ ] DevTools → Network → a gallery image is served as `image/avif` (or webp
      on Safari), not `image/jpeg`.
- [ ] The chosen width tracks the viewport: a phone-sized window pulls a 320 or
      640 candidate, a retina desktop pulls 960+. `naturalWidth` matching the
      full 2400px source means the srcset isn't being honored.
- [ ] Lightbox at full screen on a retina display pulls the 2048 candidate.
- [ ] The three hero backgrounds and the nav logo still load — they're
      **deliberately not optimized**, served straight from `photos/static/`, and
      they're the first thing to break if that tier stops being deployed.
- [ ] Transformation count in the Vercel dashboard after a browse is in the
      hundreds, not thousands. Every unique (image, width, quality, format) is
      one transformation; a `sizes` attribute that resolves to many distinct
      widths would multiply that.
- [ ] Share card (`/studio`) still renders — it draws an optimized URL into a
      canvas, so a cross-origin change there would taint it and break export.

### react-doctor baseline: zero findings

The old four-finding baseline is gone — `npm run doctor` scores 100/100 with
nothing reported. Two of the four were fixed, one stopped being reported by
react-doctor 0.9.x, and the last is now suppressed in-line with its reasoning.

Three suppressions exist in the source, each as a
`// react-doctor-disable-next-line <rule>` **immediately above the line it
applies to** (the directive must be the last comment before the code — put the
explanation above it, or the suppression silently doesn't take). They were
reviewed and the flagged code is correct as written; re-confirm rather than
re-investigate:

- `no-redundant-roles` — `Footer.jsx`. The `role="contentinfo"` is **not**
  redundant: this `<footer>` renders inside `<main>`, and a nested `<footer>`
  is not a contentinfo landmark on its own. Removing it to satisfy the rule
  deletes a landmark screen readers navigate to.
- `no-array-index-as-key` — `OrderPage.jsx`. Add-on units are positional
  ("Slice 1", "Slice 2" are rendered *from* the index) and the stepper only
  appends or truncates at the end, never reorders or splices. Synthetic ids
  would change the persisted `pp_cart:v2` shape and need a migration.
- `no-create-object-url-without-revoke` — `photos.js`. The revoke is in the
  `finally` block the rule doesn't follow into, and it has to stay there: the
  `<img>` needs the URL alive until `onload`/`onerror` settles.

If a suppression ever stops being needed, delete it rather than leaving it —
a stale suppression hides the next real finding on that line.
