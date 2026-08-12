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

## General regression pass (any change touching ordering/admin)

- [ ] Full order → admin board → status advance → pickup flow, once, in a
      real browser.
- [ ] `npm run doctor` (react-doctor) has no new findings.
