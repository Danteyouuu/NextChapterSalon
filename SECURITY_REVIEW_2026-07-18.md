# Security review + updates — July 18, 2026

Honest summary, not a "everything is perfect" claim. This covers what was checked, what was found and fixed, and what's left as an accepted/residual risk.

## Status: code is committed locally, NOT yet pushed or deployed

I don't have your GitHub credentials in this environment, so all commits below are sitting in your local repo. **You still need to run:**

```
git push
npm run deploy
```

Everything described here (security headers, rate limiting, mobile fixes, photo upload) is inert until you do that.

## What was checked

- **SQL injection** — every database call goes through `.prepare(sql).bind(...)` (D1's parameterized query API). No string-concatenated SQL anywhere. `updateSettings()` in `lib/db.js` builds its column list dynamically, but only from hardcoded object keys at each call site, never from raw user input — safe today, worth an allowlist if that function ever grows a new caller.
- **XSS / output escaping** — found and fixed one real gap: the stylist name/title in the booking page's dropdown wasn't escaped (`pages/booking.js`). Everywhere else (dashboard, gallery, team page, testimonials) was already going through `escapeHtml`/`escapeAttr`.
- **Auth & sessions** — the `/admin` password gate now has rate limiting: 8 failed attempts locks an IP out for 15 minutes (`api/admin-login.js`, tracked via a new `ncs_login_attempts` table, already applied to the live database). Without this, someone could brute-force the password at whatever rate the network allowed, since the hashing here is intentionally lightweight (fast, not bcrypt/argon2 — a deliberate tradeoff for a single-owner Worker with no heavy compute budget). The underlying `manage_token`-based auth (used by every API call) is unaffected and unchanged.
- **CSRF** — every state-changing endpoint (accept/decline appointments, manage services/stylists/settings/content) requires the `manage_token` explicitly in the request body, not a cookie. That's what actually makes this safe: a malicious site can't forge these requests because it doesn't know your token, and browsers won't auto-attach it the way they would a cookie. The new `/admin` cookie only grants access to the dashboard *page* (a GET), never to the mutating API calls underneath it.
- **Security headers** — the live site had none (verified via `curl -I`). Added baseline headers to every response: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Strict-Transport-Security`, `Permissions-Policy`, and a `Content-Security-Policy`. The CSP still allows inline scripts/styles (`'unsafe-inline'`) because the site uses them throughout — a stricter nonce-based CSP would be a bigger rewrite — but it does block framing (clickjacking), `<object>`/`<embed>`, base-tag injection, and any *remote* script an XSS payload might try to pull in.
- **Dependencies** — `npm audit`: 0 vulnerabilities.
- **Open redirects** — none found; the app doesn't do any user-controlled redirects.

## Accepted / residual risks (documented, not fixed — low priority)

- Password hashing is salted + 1000-round SHA-256, not bcrypt/argon2. Reasonable for this threat model (single password, rate-limited, not a multi-tenant system) but noting it for the record.
- `lib/ics.js`'s calendar feed doesn't escape the `UID`/`ORGANIZER` fields, but those only ever come from the system-generated token or your own settings, never customer input — negligible risk.
- The very first person to submit a password at `/admin` claims it (no separate invite/setup step). This window is now rate-limited like everything else, and your password was already set before this review, so it's closed in practice.

## Other things fixed today (not security, but you flagged them)

- **Mobile dashboard layout** — the Team, Testimonials, Gallery, and Hours tabs were rendering multi-column form rows with inline styles that ignored the mobile breakpoint entirely (a CSS specificity bug — inline styles beat the media query that was supposed to fix this). All of those now stack to one field per line under 640px, which is what was actually making them "unreadable."
- **Photo upload with crop/zoom** — added a real upload flow: new private R2 bucket, an owner-only upload endpoint, and a self-contained crop/zoom widget (drag to pan, slider to zoom, no external library) wired into both the Team tab (stylist photos — this didn't exist in the UI before, even though the database already supported it) and the Gallery tab (alongside the existing manual URL option).

## Test coverage

51/51 automated tests passing (`npm test`), up from 43 — added coverage for the rate limiter and the new upload endpoint.
