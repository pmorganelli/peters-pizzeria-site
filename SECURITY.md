# Security posture

An audit of this app against a 27-item checklist, done 2026-08-20. Each line
was checked against the code, the live response headers, or DNS — not assumed.
Re-run the **Verify** commands after any change to `api/`.

Several checklist items come from a Supabase/SQL/GraphQL world this app doesn't
live in. Those are marked **N/A** with the reason, not quietly ticked.

## Summary

| # | Item | Status |
|---|---|---|
| 1 | API keys hidden | ✅ verified |
| 2 | Purge git secrets | ✅ verified |
| 3 | Use public database key | ⬜ N/A — no client-side DB access at all |
| 4 | Enable RLS | ⬜ N/A — no SQL database |
| 5 | Encrypt sensitive data | ✅ in transit + at rest (Upstash) |
| 6 | Enforce server-side auth | ✅ |
| 7 | Lock record access | ✅ |
| 8 | Block field tampering | ✅ |
| 9 | Secure session cookies | ✅ + real expiry |
| 10 | Hash passwords | ⬜ N/A — no user accounts |
| 11 | Rate limit login | ✅ 8/IP/5min |
| 12 | Add bot protection | ⚠️ not present; rate limits cover today's threat |
| 13 | Parameterize queries | ✅ |
| 14 | Validate all input | ✅ |
| 15 | Escape user content | ✅ |
| 16 | Restrict file uploads | ✅ |
| 17 | Trim API responses | ✅ |
| 18 | Security headers | ✅ (CSP added, **not yet deployed**) |
| 19 | Force HTTPS | ✅ HSTS, preload |
| 20 | Scan dependencies | ✅ 0 vulnerabilities |
| 21 | Constant-time secret comparison | ✅ |
| 22 | Webhook SSRF protection | ⬜ N/A — no outbound requests |
| 23 | npm file checked | ✅ |
| 24 | Admin dashboard IP allowlist | ❌ recommended **against** — see below |
| 25 | DNS CAA records | ✅ inherited from `vercel.app` |
| 26 | Canary tokens | ⬜ optional |
| 27 | GraphQL query depth | ⬜ N/A — no GraphQL |

**The one finding — permanent, unrevocable admin sessions — is fixed** (see
below). Everything else was either already right or doesn't apply.

---

## Fixed: admin sessions are now time-bound

**Status: resolved.** What follows is the original finding, kept for context.

`adminToken()` **was** an HMAC of `ADMIN_PASSWORD` over the **constant string**
`'pp-admin-v1'`. It carried no issued-at, no expiry and no session id, so:

- The cookie value was byte-identical for every login, forever. Ten devices all
  held the same credential.
- `Max-Age=30 days` is a hint to the *browser*. The server accepted the token
  with no age check, so a cookie copied off a device worked indefinitely.
- Logout (`DELETE /api/login`) only cleared the browser's copy. A captured
  cookie kept working.
- The only revocation available was **changing `ADMIN_PASSWORD`**.

**The fix.** The token is now `<issuedAt>.<hmac>` with the timestamp inside the
signed message, so `verifyAdminToken()` can enforce a real 30-day expiry without
storing session state. Each login mints a distinct token, the cookie's `Max-Age`
is derived from the same constant the server checks, and there are two ways to
revoke everything at once: rotate `ADMIN_PASSWORD`, or bump the `TOKEN_VERSION`
label in `api/_lib/util.js`. `api/_lib/util.test.js` covers the expiry boundary,
backdated timestamps carrying a still-valid signature, tampered signatures, and
password rotation — verified to fail when the age check is removed.

Shorten the window by lowering `SESSION_MAX_AGE_MS`; 30 days was kept so nobody
has to re-login mid-service.

## Item 24: don't IP-allowlist the admin board

Vercel Firewall can do this, and for this app it's the wrong control. The board
is used from phones, on campus wifi, from home, mid-service. Campus NAT means
one allowlisted IP covers thousands of strangers *and* still breaks the moment
someone switches to cellular. You'd get outages every Saturday and very little
security.

The threat it's meant to stop — someone finding `/admin` and guessing — is
already handled by a password compared in constant time, an 8-per-5-minute rate
limit, and a server that refuses to run without `ADMIN_PASSWORD` set in
production. **Session expiry (above) is the control worth adding instead.**

## Item 12: bot protection

There is none beyond rate limiting (orders 15/IP/10min + 120 global, uploads
5/IP/hr + 60 global, takedowns 10/IP/hr + 100 global). For a Saturday pizza
night that is proportionate: the global caps mean even a perfect bot can't do
more than fill the board, and every order is a human picking up a slice.

If order spam ever becomes real, Vercel BotID on `POST /api/orders` is the
smallest change that helps. Don't add a CAPTCHA — it taxes every real customer
to stop a problem you don't have yet.

## Item 26: canary tokens

Optional and genuinely useful only if someone is watching the alerts. The cheap
version that fits this app: `api/login.js` already returns 401 on a bad
password — log those with the client IP and skim them occasionally. A burst of
401s against `/api/login` is the only "poking around" signal that matters here,
since there's no other authenticated surface to probe.

A planted fake secret (a decoy Redis key, a fake token in the bundle) buys
nothing without an alerting pipeline to notice it being used.

## Item 5: what's actually stored

Worth knowing what an attacker would get: customer **names**, order **notes**,
order contents and totals; on the wall, photos
plus a caption, a name, and a `deviceHash`. No payments (Venmo/Zelle happen in
person), no passwords, no addresses. Orders expire after 3 days, slices after
90. Upstash encrypts at rest and everything moves over TLS.

**Done:** `contact` is no longer accepted or stored — it hadn't been collected by
any UI in a long time. `publicOrder()` still strips it on the way out, because
orders written before the change can be live for their 3-day TTL; a test now
pins that behaviour so the destructure doesn't get tidied away.

## Verify

```bash
# 1, 2 — no secrets in the bundle or in git history
grep -rc "UPSTASH\|ADMIN_PASSWORD\|BLOB_READ_WRITE\|KV_REST" dist/assets/*.js   # expect 0
git log --all --pretty=format: --name-only | sort -u | grep -iE "^\.env|\.pem$"  # expect empty

# 15, 22 — no raw HTML injection, no outbound request surface
grep -rn "dangerouslySetInnerHTML\|innerHTML" src/ api/    # expect none
grep -rn "fetch(" api/ | grep -v test                      # expect none

# 18, 19 — live headers (CSP appears only once the current branch deploys)
curl -sI https://peters-pizzeria-site.vercel.app/ | grep -iE "strict-transport|content-security|x-frame|x-content-type"

# 20 — dependencies
npm audit --omit=dev                                       # expect 0 vulnerabilities

# 25 — CAA (Vercel-managed for *.vercel.app; becomes yours with a custom domain)
dig +short CAA vercel.app
```

## Notes on the items that don't apply

- **3, 4 (public DB key, RLS)** — these protect a database the browser talks to
  directly. Nothing in this app does: the only datastore credentials live in
  serverless functions, and the client's entire access surface is the handlers
  in `api/`. That's a stronger position than RLS, not a weaker one.
- **10 (hash passwords)** — there are no user accounts. The single admin
  password is an environment variable, never stored, and compared as
  `sha256 → timingSafeEqual`. Password *hashing* (bcrypt/argon2) is for
  databases of user credentials, which this app doesn't have.
- **13 (parameterize queries)** — no SQL. The equivalent risk is Redis Lua, and
  all three scripts (`RATE_LIMIT_LUA`, `SET_STATUS_LUA`, `QUOTA_LUA`) are
  module constants with values passed as `KEYS`/`ARGV`, never interpolated.
  Redis keys are built by prefixing (`pp:slice:${id}`), so a hostile id can only
  ever name a key inside its own namespace.
- **22 (webhook SSRF)** — SSRF needs an outbound request to an
  attacker-influenced URL. `api/` makes no `fetch()` calls at all; the only
  egress is the Upstash and Vercel Blob SDKs to fixed hosts.
- **27 (GraphQL depth)** — no GraphQL.
