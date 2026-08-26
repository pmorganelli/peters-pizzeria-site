# Integrated repository review

[P1] Require a real secret for public order lookup — api/orders.js:181

`findOrder()` accepts any two-character name prefix, and the response at line 212 includes the order id, pickup code, customer name, items, total, and status. The pickup code is then accepted as the sole order credential by `POST /api/slices`, so querying a common prefix can expose a customer's order and let an unauthenticated visitor publish images under that order. Require the exact pickup code or another strong secret, and omit sensitive fields from any deliberately non-secret search.

[P1] Make closing a night an atomic claim — api/nights.js:43

Two concurrent authenticated closes can both read the same non-empty order list before either clears it. Each creates a separate permanent archive and both requests return 201, duplicating every order and the revenue total. The existing empty-board 409 only protects a later sequential request; use a lock, CAS, or one Redis transaction/Lua script for snapshot-and-claim.

[P1] Stop trimming still-live orders out of the operational index — api/_lib/store.js:31

Every order key lives for three days, but the only index used by the admin board, pickup-code lookup, slice posting, and night close is trimmed to 300 ids. The 301st live order therefore makes the oldest order unreachable from those workflows while its key still exists, so staff cannot advance or archive it. The configured intake limit permits this state; retain all live ids or reject intake before exceeding a capacity that the UI can actually operate.

[P1] Delete public Blob objects when slice metadata expires — api/_lib/slices.js:32

Slice metadata expires after 90 days, but the matching public Vercel Blob is deleted only through the explicit DELETE handler. When Redis expires the record, the image remains retrievable at its public URL and the app no longer has the pathname, ownership token, or admin record needed to remove it. Add a documented Blob lifecycle/cleanup job and preserve enough metadata to make deletion reliable.

[P2] Make order submission idempotent across ambiguous failures — src/pages/OrderPage.jsx:377

The client records success and clears the cart only after the POST response resolves. If the server creates an order but the response is lost, the UI keeps the cart, shows an error, and enables retry; the server always creates a fresh id, producing a duplicate kitchen order. Persist a client idempotency key until the result is reconciled and enforce it server-side.

[P2] Reserve pickup codes atomically — api/orders.js:151

Each request reads the current code set, chooses a code, and later writes the order without a uniqueness constraint. Concurrent requests validate against the same stale set; a 240-request burst has roughly a 3% birthday-collision probability in the 31^4 code space. A collision makes lookup and posting select one customer's order for the other's code; reserve the code with an atomic conditional write.

[P2] Make partial store-setting updates concurrency-safe — api/store.js:33

PATCH reads the entire settings object, changes selected fields, and unconditionally writes the whole object. Concurrent hours/mode and availability updates can therefore overwrite one another, and two admin tabs toggling different sold-out items can make an item orderable again. Use field-level atomic operations or a version/CAS contract with client refresh and retry.

[P2] Merge takedown reports atomically — api/_lib/reports.js:52

Two reporters can read the same record, independently append different device hashes, and then overwrite one another. If both see no existing record, both also push the same slice id into the report index. The admin can see an undercount or duplicate queue rows; move the merge and index update into one Redis transaction or Lua script.

[P2] Enforce the upload cap while streaming the request — api/slices.js:181

The early size check trusts `Content-Length`. A chunked or headerless request reaches `readBody()`, which buffers every chunk before the decoded/base64 length is checked, bypassing the intended 1.5 MB pre-read cap and exposing the directly listening development server or another Node deployment to avoidable memory pressure. Count bytes while reading and abort as soon as the limit is exceeded.

[P2] Reject images with excessive decoded dimensions — api/slices.js:215

The endpoint caps compressed bytes but accepts any nonzero dimensions from JPEG, PNG, or WebP headers. A highly compressed image under 1 MB can declare a pixel count large enough to exhaust memory during decode; the wall serves Blob URLs directly to visitors and staff. Enforce maximum width, height, and total pixels before upload.

[P2] Keep the permanent night archive reachable past 200 closes — api/_lib/nights.js:28

Night records never expire and are described as the permanent revenue record, but `createNight()` trims their only list index to 200 ids. After the 201st close, the oldest record remains in Redis but disappears from every reachable list/API workflow; 200 Saturdays is under four years, not “years” in the durable-accounting sense implied by the code. Paginate the full index or apply an explicit, documented retention policy that deletes records consistently.

[P2] Prevent older polling responses from rolling state backward — src/pages/StatusPage.jsx:46

The status, order, and admin pages start interval requests without serializing or aborting the previous poll, then apply every response. A slower response carrying an older `new` state can land after `firing` or `ready` and regress the UI; the admin epoch only distinguishes mutations, not two polls from the same epoch. Abort, serialize, or sequence responses before applying them.

[P2] Do not save draft hours from the store-mode buttons — src/pages/AdminPage.jsx:122

The schedule editor presents an explicit “Save times” action, but “Open now,” “Close,” and “Use schedule” all also send `currentHours()`. An operator can edit a time, click Close only to stop orders, and unintentionally persist the unsaved schedule. Mode controls should PATCH only the mode; the explicit save should own hour changes.

[P2] Give the admin board an explicit base title — src/hooks/useBoardTitle.js:6

`BASE_TITLE` is captured when the lazy admin chunk evaluates. Navigating from Gallery or Menu therefore captures that page's title, and an empty admin queue restores the wrong title; a direct `/admin` load keeps the generic index title. Use the defined Admin title as the stable base and restore the route title on cleanup.

[P2] Set the Past Nights route title — src/App.jsx:130

`App` skips title updates for both admin routes on the assumption that `useBoardTitle` owns them, but `NightsArchivePage` never uses that hook or writes `document.title`. `/admin/nights` consequently retains either the generic index title or the prior Admin title instead of the already-defined Past Nights title.

[P2] Close the mobile menu after history navigation — src/components/Nav.jsx:16

The menu closes only through `doNav()`. Browser Back/Forward changes the `page` prop through `popstate` without changing `menuOpen`, so the fixed mobile panel remains over the newly restored page. Reset the menu whenever the active route changes.

[P2] Expose the hamburger menu's expanded state — src/components/Nav.jsx:42

The hamburger button has only `aria-label="Menu"`; it does not expose `aria-expanded` or identify the controlled links. Screen-reader users cannot determine whether the mobile navigation is open. Add a stable id to the link container and set `aria-expanded`/`aria-controls` from `menuOpen`.

[P2] Give gallery images meaningful accessible descriptions — src/pages/GalleryPage.jsx:35

Gallery controls are named only by ordinal and the images use equally generic alternatives; the lightbox then uses `alt="Enlarged view"`. A nonvisual visitor cannot determine the subject of any photo before or after opening it. Store per-photo descriptions and use them for the button/image accessible names.

[P2] Give Studio photo choices unique names and selected state — src/pages/StudioPage.jsx:165

All 52 thumbnail buttons have the same “Use this photo” accessible name, their images are alt-empty, and the selected thumbnail is represented only by CSS. Keyboard and screen-reader users cannot choose a known image or tell which one is selected. Use a unique description and expose selection with `aria-pressed` or an equivalent pattern.

[P2] Generate route-specific crawl and share metadata — index.html:7

Every deep link is rewritten to the same home-page HTML metadata. Client routing changes only `document.title`, so article and page URLs retain the home description, Open Graph URL, title, and image for crawlers and social unfurlers that do not execute the app. Pre-render or generate route-specific metadata for each public URL.

[P3] Stop using the build date as every sitemap entry's last modification date — scripts/gen-sitemap.mjs:26

Every build marks every URL as modified today, even when its content did not change, and a local build dirties the tracked sitemap solely because the date advanced. Derive `lastmod` from content/page changes or omit it when no trustworthy source exists.

## Verification and residual risk

- All four worker reports were reconciled against the cited source and duplicate findings were collapsed.
- `node --check` passed for every JavaScript/MJS file under `api/` and `scripts/`.
- Route round-trips passed for all 10 page routes; all 52 gallery photos have ratio metadata.
- `git diff --check` passed; application source is unchanged.
- `npm test`, `npm run lint`, and `npm run build` could not reach their actual tools because this checkout has no installed dependency tree (`vitest`, `eslint`, and `vite` were not found). The build's sitemap side effect was restored.
- Redis concurrency, Vercel Blob lifecycle behavior, browser accessibility, and deployed metadata remain static-analysis findings pending integration/browser tests.
