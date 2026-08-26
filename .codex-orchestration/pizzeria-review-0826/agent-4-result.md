[P1] Require a pickup secret for order lookup — api/orders.js:181

The public status endpoint accepts any two-character name prefix and returns `publicOrder`, which still contains the order id, pickup code, customer name, items, total, and live status. The UI explicitly invites name lookup (`StatusPage.jsx:99`). Thus an unauthenticated visitor can query common prefixes such as `sa`, receive the newest active matching order, and retain its id for continued polling; the exposed pickup code can also be used to post to the customer wall. Rate limiting does not make a name a credential. Restrict lookup to a sufficiently strong secret (or require the full order id/code) and omit sensitive order fields from any deliberately non-secret search.

[P1] Delete public Blob objects when slice records expire — api/_lib/slices.js:32

Slice metadata receives a 90-day Redis TTL, but the matching image is uploaded as a public Vercel Blob (`api/slices.js:248`) and is deleted only on an explicit DELETE request. Redis expiry simply makes the record disappear from `listSlices`; it does not invoke `del` for the Blob. A poster's photo therefore remains publicly retrievable at its known URL indefinitely after the advertised retention window, with no app-level record available to the poster or admin for removal. Add a cleanup path/lifecycle policy that deletes the Blob before or at metadata expiry, and retain enough metadata to make the cleanup reliable.

[P1] Make closing a night an atomic claim — api/nights.js:43

Two authenticated admins can both call `POST /api/nights` before either reaches `clearOrders`. Each invocation reads the same non-empty order list, writes its own permanent archive at line 66, and then clears the shared ids. Both calls return 201, duplicating every order and revenue total in the archive. The empty-board check only catches a later request, not this overlapping read/write race. Use a Redis lock/CAS or one Lua transaction that claims the live index and creates exactly one archive.

[P2] Atomically merge concurrent takedown reports — api/_lib/reports.js:52

The production report path performs `GET`, merges in JavaScript, then `SET`. Two different browsers flagging the same slice concurrently can both read the same old record and each write a count of one (or overwrite another increment/device hash). The admin panel consequently undercounts independent takedown requests, despite presenting that count as its moderation signal. Move the merge and index update into an atomic Redis script or transaction.

[P2] Generate route-specific crawl and share metadata — index.html:7

Every deep link is rewritten to the same HTML document, whose title, description, Open Graph URL, and image all describe the home page. `App.jsx:129` changes only `document.title` after client rendering; it never updates the description, canonical URL, or Open Graph fields. Consequently a shared blog/article URL produces the generic home-page card (and its home URL), rather than the article's title, description, and image. Pre-render route metadata or supply it from the server/build for each sitemap URL.

[P3] Do not set sitemap lastmod to the build date — scripts/gen-sitemap.mjs:26

Every build writes today's date as `<lastmod>` for every URL, even when no page changed. This both dirties the tracked sitemap during a local build and falsely tells crawlers that the entire site changed on every deployment, reducing the usefulness of the sitemap's change signal. Derive each value from actual content/page modification data, or omit `lastmod` when that data is unavailable.

Overall assessment: The deployment configuration and client/API path conventions are generally aligned, but public order lookup and public-Blob lifecycle create material privacy/security exposure. Concurrent operations also lack atomicity where the UI presents irreversible financial or moderation state.

Tests run:

- `npm test` — failed (exit 127): `sh: vitest: command not found`.
- `npm run lint` — failed (exit 127): `sh: eslint: command not found`.
- `npm run build` — `gen:sitemap` ran (`sitemap.xml: 8 urls`), then failed (exit 127): `sh: vite: command not found`.
- `git diff --check` — passed. The build-generated sitemap date change was restored; dependencies were not installed because the brief forbids network/sandbox escalation.

Files changed: None (report only).

Residual risks: No browser/Vercel deployment validation was possible without the absent dependency tree or credentials. The reported production Redis/Blob races should receive integration tests that issue overlapping requests against a real Redis-compatible service.
