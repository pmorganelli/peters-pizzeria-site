[P1] Closing the same live board concurrently creates duplicate permanent night archives — api/nights.js:43

Two authenticated `POST /api/nights` requests can both finish `listOrders()` before either reaches `clearOrders()`. Each then constructs and persists a different night from the identical snapshot at line 66, and both clear the same ids at line 70. The second request therefore succeeds with a duplicate revenue/order archive rather than receiving the intended 409; the sequential test does not exercise this interleaving.

[P1] The order index silently drops live orders that are still valid — api/_lib/store.js:12

`createOrder()` trims `pp:order-index` to 300 ids while each order record remains live for three days. Once 301 orders exist, the oldest record is no longer returned by `listOrders()`, so it vanishes from the admin board and from the close-night snapshot, cannot be found by pickup code or used to post a slice, and later expires without being archived. The configured global intake rate explicitly permits this state (240 orders per ten minutes), so it is not merely theoretical.

[P2] The upload-size limit trusts an attacker-controlled header and buffers oversized chunked requests — api/slices.js:181

The only pre-read limit is `Content-Length`; a request sent with chunked transfer encoding (or no length) falls through to `readBody()`, which collects every chunk in memory at `api/_lib/util.js:11-14`. Only after the full JSON body has been buffered does line 202 reject a large image string. This bypasses the stated 1.5 MB request cap and lets a small number of requests consume function memory; the same unbounded reader is shared by the other JSON endpoints.

[P2] Concurrent takedown requests lose distinct reporters and can duplicate queue rows — api/_lib/reports.js:52

In Redis-backed production, two reports for the same slice can both read the same `existing` value, independently merge in different device hashes, and each `SET` its version. The last write loses the other report. When the record did not yet exist, both calls also skip `LREM` and `LPUSH` the same id, so `listReports()` returns duplicate rows for that photo. This defeats the count the admin is meant to rely on; the sequential tests do not cover it.

[P2] Concurrent order creation does not reserve pickup codes atomically — api/orders.js:151

Each request reads the current code set, chooses a random four-character code, and later writes its order without a Redis uniqueness constraint or conditional write. Concurrent requests therefore all validate against the same stale set; at the supported 240-request burst limit, the birthday probability of at least one collision in the roughly 923,000-code space is about 3%. `findOrder()` and slice posting select the first matching record, allowing one customer to track or spend another customer's shared pickup code.

[P2] Independent store-setting edits overwrite one another — api/store.js:33

PATCH implements a read-modify-write of the entire settings document. If one admin changes the availability list while another changes opening mode/hours, both derive `next` from the same `existing` value and the later `saveSettings(next)` discards the first edit. The endpoint documents these as independent partial updates, but there is no optimistic version check or atomic Redis merge.

[P2] The supposedly permanent night archive becomes unreachable after 200 records — api/_lib/nights.js:10

`createNight()` ltrims the only index used by `listNights()` to 200 ids. Night records themselves never expire, but after the 201st close the oldest archive is no longer returned by any API route (there is no GET-by-id endpoint). The comment calls this "years of Saturdays," but 200 Saturdays is fewer than four years, after which historical revenue records silently disappear from the UI.

[P2] Accepted images have no pixel-dimension limit, enabling client-side decompression bombs — api/slices.js:215

The endpoint limits compressed bytes but accepts any nonzero dimensions decoded from JPEG, PNG, or WebP headers and immediately publishes the blob. A highly compressible, valid high-resolution image can remain under 1 MB yet require hundreds of megabytes or more to decode; the public wall then fetches and renders every visible image. A customer with one valid pickup code can therefore make wall visitors and staff browsers attempt an oversized decode. Enforce a maximum width, height, and total pixel count before upload.

Overall assessment: the API has strong basic authentication, validation, and error handling, but its multi-step Redis workflows are not consistently atomic. The most consequential gaps are archival and active-order index integrity under concurrent/high-volume operation.

Tests run: `npm test -- --run api` (failed before running: `vitest: command not found`; dependencies are not installed in this snapshot).

Files changed: None (source and tests were not modified). Result report written at this path only.

Residual risks: Redis-backed paths, Blob behavior, and Vercel body-parser limits could not be exercised without installed dependencies and production credentials. The reported races follow directly from separate read/write operations in the production code paths.
