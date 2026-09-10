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

- [ ] Full journey: staff place an order → hand the customer the pickup code →
      customer looks it up on Slice Status → once it's `ready`/`done`, tap the
      CTA → composer opens prefilled with the name → post a photo → it appears
      on `/slices`. (Posting itself needs none of that any more; this checks
      the handoff still works for someone who came from an order.)
- [ ] Post straight from `/slices` in a private window — no order, no pickup
      code, nothing typed — and confirm it goes up.
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
- [ ] Post 3 photos from one browser, confirm the API refuses a 4th with the
      "3 photos from this device today" message, then clear site data and
      confirm a 4th goes through. That reset is expected — the cap is a speed
      bump, not a control — so the point is confirming the *rate limits* are
      what actually stop a flood, not the counter.
- [ ] The per-device counter lives in Redis under `pp:slice-quota:dev:<hash>`
      with a 24h TTL, and the in-memory dev store ignores TTLs entirely — so
      the window only really expires against a real database. Post 3, wait out
      (or `DEL`) the key on a staging Redis, confirm the 4th is accepted.
- [ ] Post-as toggle: choose Anonymous and confirm the tile goes up with no
      name at all; choose "My name", type one, and confirm it shows. Flip
      between the two and confirm what you typed survives the round trip.
- [ ] Arriving from an order card's CTA, the composer should open with the
      attributed option already selected and the name filled in. Arriving from
      the nav with nothing stored, it should start on Anonymous.
- [ ] Post once with a name, then reopen the composer on the same device and
      confirm it remembers it. Post anonymously and confirm it *stops*
      remembering — opting out shouldn't be undone on the next visit.
- [ ] Type a 40-character name and confirm what lands on the tile is truncated
      at 20 without breaking the tile's layout at phone width.
- [ ] Confirm the composer no longer shows a pickup-code field, and no line
      about a per-device photo limit.

## Staff-only ordering (`OrderPage.jsx`, `Nav.jsx`, `api/orders.js`)

The gate itself is covered in Vitest (`App.test.jsx`, `OrderPage.test.jsx`,
`api/orders.test.js`). What isn't is how it *looks* once a button that was
always there stops being there, and how the session behaves across a real
HttpOnly cookie rather than a mocked `/api/login`.

- [ ] **The nav CTA swap is the item most worth a real device.** Signed out it
      reads "See the Menu", signed in "Order Now", and the first is ~24px
      wider — almost exactly the room the 17px wordmark buys back below 430px.
      `.nav-order-btn` tightens its padding over that range to pay for it, and
      that number was reasoned, not measured. Sweep 320–500px signed out and
      confirm badge + wordmark + CTA + hamburger never touch, especially at
      390–430px (iPhone 15 Plus/Pro Max at 430, Pixel Pro at 412).
- [ ] Same sweep signed in, where the CTA is the shorter label. This is the
      layout the breakpoints were originally tuned for.
- [ ] Log in on the admin board and confirm the nav CTA flips to Order Now
      **without a reload** (that's what `onAuthChange` is for), then log out
      and confirm it goes back to See the Menu the same way.
- [ ] On a fast reload while signed in, watch for the CTA rendering "See the
      Menu" first and then swapping — expected (the session check is async),
      but confirm it doesn't reflow the rest of the bar when it happens.
- [ ] Load `/order` directly signed out and confirm the window card renders
      once, with no flash of the cart or of a different card first. Open
      DevTools' network tab and confirm the page makes no `/api/store` or
      `/api/orders` request at all.
- [ ] On a slow connection (throttle to 3G), load any page signed in and watch
      the nav: the CTA should fade in late rather than appearing and vanishing.
- [ ] Menu page, signed out: confirm the Venmo box closes up cleanly with its
      third child gone, at desktop and at phone width.
- [ ] Slice Status signed out: nothing under the lookup form (the opening-hours
      line is gone), and "Start another order" on a tracked order should drop
      back to the lookup form rather than navigating anywhere.
- [ ] `POST /api/orders` from `curl` with no cookie → 401. Confirm the same
      request with a *tampered* cookie value is also 401, not a 500.

## Name lookup on Slice Status (`StatusPage.jsx`, `api/orders.js`)

The matching rules and the tie picker are covered in Vitest. What isn't is how
this behaves against a real board with real customer names, which is the part
that decides whether the feature is usable or annoying.

- [ ] Take three orders under names a real night would produce — including two
      people with the same first name — then look each up by name from a
      different device with nothing in localStorage.
- [ ] Search a name in all caps, all lowercase, and with a double space in the
      middle. All three must land on the same order.
- [ ] Confirm a first name alone does **not** find someone who gave a full
      name at the window. This is deliberate (exact match only), but it's the
      most likely source of "it says my order doesn't exist" — decide whether
      staff should be typing first names only into the board, and be
      consistent about it.
- [ ] Tie picker: the rows show items, status, age and total. With two orders
      of *the same items* under the same name, confirm the rows are still
      tellable apart (age and total are all you get) — and if they aren't,
      that's the case to think about before a busy night.
- [ ] Pick a row and confirm the pickup code that appears is the right one, and
      that a refresh keeps tracking it (`pp_order_id`).
- [ ] Search a name that matches nothing and read the actual error text.
- [ ] Trip the 30/IP/10min limiter with repeated name searches and confirm the
      message makes sense to a customer who was just mistyping their name.
- [ ] **Privacy sanity check, once, with someone else watching:** search a
      teammate's name and confirm you can see their order and its pickup code.
      That is the accepted trade (see CLAUDE.md), but look at it working before
      a real service so nobody is surprised by it later.

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

## Type and layout (`index.css`)

- [ ] **"Where's my slice?" on Slice Status, desktop only.** The italic `?`
      used to have its bowl clipped by the SplitText line mask; `.line-reveal
      > div` now pads 0.12em to the right with a matching negative margin.
      Reload a few times and watch the reveal actually animate — the clip was
      only visible on the settled frame, but the padding could in principle
      shift where a line wraps. Check the menu, blog and gallery hero titles in
      the same pass, since they share the rule and they're the multi-line ones.
- [ ] Same headline at 767px and 769px — the phone branch skips SplitText
      entirely, so the two sides of that breakpoint use different machinery.
- [ ] Homepage with no `special` items in menu.js: the dark strip should read
      "Specials coming soon." at a sensible size on phone and desktop, not a
      heading floating over nothing.
- [ ] Menu page with an empty category (Desserts & Sides right now): the
      heading should sit above a "Coming soon." line on the same rule the item
      list uses, not collapse into the next section.

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

## Redis-only paths (`api/_lib/store.js` Lua)

The suite runs with **no Redis env vars**, so every `EVAL` in `store.js` is
exercised by nothing — the in-memory fallback beside it is what the tests hit,
and the two have already drifted once. These need a real Upstash instance
(a scratch database on a preview deploy is enough).

- [ ] **Empty 86 list round-trip.** On a database with no `pp:settings` key,
      save the storefront panel once (any change — "Open now" is enough), then
      read the key back with `redis-cli GET pp:settings` / the Upstash console.
      It will contain `"unavailable":{}`, **not** `[]` — cjson cannot encode an
      empty array. That is expected and is why `normalizeSettings()` coerces it;
      what this checks is that ordering, the order page, and the admin board all
      still work afterwards. Before the coercion this state 500'd every
      `POST /api/orders` and crashed both pages, permanently.
- [ ] Same check after 86'ing one item and then un-86'ing it — the
      `availability` branch builds its own empty table and hits the same
      encoding.
- [ ] **Code-index epoch.** Confirm `pp:order-code-epoch` appears after the
      first order placed on a fresh database, holds a millisecond timestamp,
      and has **no TTL** (`TTL pp:order-code-epoch` returns `-1`). If it ever
      expires, both legacy board scans switch back on permanently.
- [ ] **Legacy pickup codes still resolve at cutover.** Deploying the code
      index onto a board that already holds orders is a one-time event that
      can't be replayed later: before promoting, place an order on the *old*
      build, promote, then look that order's pickup code up on Slice Status.
      It must be found (via the fallback scan) and must resolve instantly on a
      second lookup (backfilled into `pp:order-code:`).
- [ ] A wrong pickup code on `?find=` returns "not found" without a full board
      scan once the epoch is older than three days — check the Upstash command
      count, not just the response.

## General regression pass (any change touching ordering/admin)

- [ ] Full order → admin board → status advance → pickup flow, once, in a
      real browser. Start by logging in — placing the order is a staff action
      now, and `/order` shows the window card until you do.
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
