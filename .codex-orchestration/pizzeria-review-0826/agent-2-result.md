[P1] Name lookup discloses a pickup credential that authorizes public posts — src/pages/StatusPage.jsx:65

The status form accepts any two-character name fragment and sends it to `GET /api/orders?find=…` (line 69). The handler treats a first-name or prefix match as sufficient (`api/orders.js:181-193`) and returns `publicOrder`, which still contains `code` (`api/orders.js:171-177`). That code is then accepted by `POST /api/slices` as the sole order credential and attributes the uploaded image to the order's customer (`api/slices.js:220-273`). Consequently, anyone can query a common prefix such as `Sa`, obtain the newest active matching customer's code, and spend that order's three-photo quota to publish an attributed image. Require an exact, sufficiently strong pickup credential for this flow, or do not return a post-authorizing credential from name lookup.

[P2] Order submission is not idempotent after an ambiguous network failure — src/pages/OrderPage.jsx:377

`place()` saves the order id and clears the cart only after the POST response resolves (lines 377-389). If the server creates the order but the response is lost or the connection is interrupted, the catch path retains the cart, displays an error, and re-enables the submit button (lines 390-396). Retrying sends an indistinguishable second POST, while `api/orders.js:155-168` always assigns and persists a fresh order id. This creates duplicate kitchen orders from a single customer action; use a client-generated idempotency key (persisted until the outcome is reconciled) and enforce it server-side.

[P2] Reordered polling responses can roll the displayed order state backward — src/pages/StatusPage.jsx:46

The status page starts an immediate fetch and an unconditional interval without waiting for the previous request (lines 46-60), then accepts every response (line 48). A slow request that read `new` can therefore resolve after a later poll has already rendered `firing` or `ready`, temporarily reverting the customer-facing status. `OrderPage.jsx:282-295` has the same pattern, and `AdminPage.jsx:301-320` protects only mutations with `epochRef`, not two overlapping polls with the same epoch. Track a monotonically increasing request sequence, abort the prior request, or serialize polls before applying results.

[P2] Store-mode buttons silently save unsaved schedule edits — src/pages/AdminPage.jsx:121

Changing the schedule fields only updates `draft`, and the separate “Save times” button is the apparent commit action (lines 142-157). However, each “Open now”, “Close”, and “Use schedule” button also sends `hours: currentHours()` (lines 121, 129, and 136). Thus, an operator can edit a time, press “Close” merely to stop orders, and unintentionally persist the pending schedule; the server accepts and saves those hours as part of the PATCH (`api/store.js:36-48`). Mode controls should PATCH only `mode`, leaving schedule changes to the explicit save action.

[P2] Availability updates can overwrite another admin's 86 changes — api/store.js:33

The admin client computes a complete `unavailable` array from its locally cached `storeInfo` (`src/pages/AdminPage.jsx:354-358`). Two tabs starting from the same list and 86'ing different items send different complete arrays. The handler merges each request with its own read but then persists the whole settings object with an unconditional write (lines 33-48), so the last request replaces the other tab's change and can make a sold-out item orderable again. Provide an atomic add/remove operation (or version/CAS conflict handling) and refresh/retry the client on conflict.

Overall assessment: The order, status, and admin flows have solid basic validation and terminal-state protection, but the public lookup currently crosses an authorization boundary, and several transactional/race paths can produce duplicate or stale operational state.

Tests run: `npm test -- src/pages/OrderPage.test.jsx src/utils/api.test.js src/utils/orders.test.js src/utils/slices.test.js api/orders.test.js api/reports.test.js api/nights.test.js` — could not run because dependencies are absent: `sh: vitest: command not found`.

Files changed: None (source and tests unchanged; this required report is the only write).

Residual risks: The focused suites contain no coverage for the findings above, particularly ambiguous POST outcomes, out-of-order poll completions, and concurrent settings writes. Browser-level and Redis-backed concurrency behavior remains unverified in this checkout.
