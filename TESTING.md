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
- [ ] Post a real photo from a phone camera via the "Take or choose a photo"
      button on iOS Safari and Android Chrome (`capture="environment"` should
      open the camera app directly, not a file picker).
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
- [ ] `npm run doctor` (react-doctor) has no new findings.
