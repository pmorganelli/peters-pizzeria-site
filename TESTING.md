# Testing

Automated coverage lives next to the code it tests (`*.test.js`, run via `npm test`).
This file is the other half: a running checklist of things that can't be
asserted cheaply in Vitest — real browser behavior, real file uploads, real
devices — kept here so it survives across features instead of living in
someone's head. Add to it whenever you ship something that needed manual
poking to trust.

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

## General regression pass (any change touching ordering/admin)

- [ ] Full order → admin board → status advance → pickup flow, once, in a
      real browser.
- [ ] `npm run doctor` (react-doctor) has no findings beyond the four known
      ones below. The gate is *no new findings*, not a zero score.

### Known react-doctor baseline (4 findings, all reviewed)

Each was read in context and left deliberately. Re-confirm rather than
re-investigate; if one of these changes shape, that's worth a look.

- `effect-needs-cleanup` — `SlicesPage.jsx:284`. **False positive.** The
  cleanup on the effect's last line calls `stop()`, which clears the
  interval, and removes the visibility listener. The rule can't follow the
  indirection through `stop()`. (react-doctor 0.9.x no longer reports it.)
- `no-noninteractive-element-interactions` — `Lightbox.jsx:51`. **False
  positive.** The handler is on a native `<dialog>`, and it's the
  click-outside-to-close backdrop; Esc and arrow keys are already handled.
- `no-array-index-as-key` — `OrderPage.jsx:88`. **Deliberate**, and already
  carries an `eslint-disable-next-line` the doctor doesn't honor. Add-on
  units are positional ("Slice 1", "Slice 2") with no stable per-unit id —
  the index *is* the identity.
- `no-flush-sync` — `App.jsx:109`. **Deliberate**, drives the 260 ms
  directional page transition. The rule's concern is the View Transitions
  API, which this app doesn't use. Changing it is a behavior change and
  belongs in its own PR, not bundled with a feature.
