# Authentication: how it works, the decision, and what is still open

Status: **sessions are an HttpOnly cookie, served same-origin, with CSRF protection.** This replaced the earlier design (a bearer token kept in the browser's `localStorage`) after the decision to host the app and API on one site. Everything marked *verified* ran in this repository against the real Django server in Chromium; everything else is a recommendation or an untested assumption and says so. Nothing is deployed, so **production HTTPS behaviour is unverified**.

## 1. What exists now

| Aspect | Behaviour | Where |
| --- | --- | --- |
| Layout | The app calls `/api/...` on **its own origin**. A reverse proxy routes `/api/` to Django (the Vite dev and preview servers do the same locally). No CORS is involved in the normal flow | `vite.config.js`, `docs/DEPLOYMENT.md` |
| Credential | The same opaque random token as before (stored **hashed** on the server, expiring, revocable), now carried in a cookie | `accounts/models.py`, `config/auth_cookies.py` |
| Session cookie | `arcloop_session`: **HttpOnly** (page script cannot read it), **SameSite=Strict**, **Path=/api/** (sent only to the API, never with page or asset requests), **Secure in production** (not in local HTTP development), `Max-Age` = the token's remaining life | `config/auth_cookies.py`, `config/settings.py` |
| CSRF | A request authenticated only by the cookie that **changes data** must carry Django's CSRF check: the `X-CSRFToken` header equal to the `arcloop_csrf` cookie (readable by the page, SameSite=Strict, Path=/), and a same-origin `Origin`. Reads need nothing. Refusals are `403 csrf_failed` | `accounts/authentication.py` |
| Sign-in | The browser asks for `transport: "cookie"`: the server sets the two cookies and the **response body has no token**, so page script never holds the credential. A new CSRF secret is issued at every sign-in | `accounts/views.py` (`start_session`) |
| Session in the page | Only `{ user }`, in memory. Nothing in `localStorage`/`sessionStorage`; a reload asks `/auth/me/` who the cookie belongs to. The previous design's stored token is deleted at start-up | `src/services/api/apiClient.js` |
| Logout | `POST /auth/logout/` (needs CSRF): the token is deleted on the server **and** both cookies are cleared. A copy of the old cookie is useless afterwards | `accounts/views.py` |
| Expiry | Server-side, 30 days by default (`DJANGO_TOKEN_LIFETIME_DAYS`), no renewal. An expired, revoked or unknown cookie gets a `401` whose answer also clears it | `accounts/authentication.py`, `config/errors.py` |
| Revocation | Password change signs out the **other** devices; password reset and account deletion sign out **all** | `accounts/views.py` |
| Bearer tokens | **Still supported by the server** for non-browser clients (scripts, tests, a possible future native app): `Authorization: Bearer ...` is the default `transport` of login/register, needs no CSRF (another site cannot attach that header), and wins if both are present. **The browser app no longer uses it** | `accounts/authentication.py` |

## 2. Decision and why

Decision (recorded): serve the app and API from one site, preferably one origin, and move browser authentication to an HttpOnly cookie as a separate, tested change.

Why this and not the old design: a token in `localStorage` can be copied by **any script that runs on the page** (cross-site scripting, a compromised dependency) and reused elsewhere for up to its lifetime. An HttpOnly cookie cannot be read by script. The cost, now paid and tested, is CSRF: the browser attaches the cookie by itself, so writes must prove they came from the app.

What did **not** get better, stated plainly:
- **Script that runs on the page can still act as the user while the page is open** (it can call the API; the browser attaches the cookie and the script can read the CSRF cookie). Cookies remove *theft and offline reuse* of the credential, not on-page abuse. The strict Content-Security-Policy (`docs/DEPLOYMENT.md`, `deploy/securityHeaders.js`, verified in Chromium against the production build) is what makes script injection hard; it only protects once the host sends it.
- **Same-site is not same-origin.** `SameSite` ignores the port and the subdomain: a different port on the same host, or a sibling subdomain, is "same-site" and receives the cookie. That is why the CSRF token and Origin check do the real work, and why every other service on the same registrable domain must be trusted (a compromised subdomain could attack the app). Proven by a test below.

## 3. What was verified (all against the real Django server in Chromium unless stated)

| Behaviour | Evidence |
| --- | --- |
| Register and log in set an HttpOnly, SameSite=Strict, Path=/api/ cookie with a ~30-day expiry; the body has no token; `document.cookie`, `localStorage` and `sessionStorage` contain no credential; the CSRF cookie *is* readable | `e2e-django/auth.spec.js`, `backend/tests/test_cookie_auth.py` |
| Session persists across reloads; two browsers signed in to one account are independent; logging out of one leaves the other signed in | `e2e-django/auth.spec.js` |
| Logout clears both cookies **and** revokes the token: a copy of the cookie (as a thief would hold) gets 401 afterwards | `e2e-django/auth.spec.js`, backend tests |
| A session ended elsewhere signs the browser out on its next request and the dead cookie is cleared | `e2e-django/auth.spec.js` |
| A write without the CSRF header, with a wrong one, or with another person's is refused and changes nothing; with the right one it works | `e2e-django/auth.spec.js`, backend tests |
| A request claiming another `Origin` is refused even with a valid CSRF token and gets no CORS permission | `e2e-django/auth.spec.js` |
| **A real cross-origin form POST to the API from the signed-in page is refused and the user stays signed in.** The browser *did* send the SameSite=Strict cookie (a different port is the same site), so it is the CSRF token that stopped it | `e2e-django/auth.spec.js` |
| Script on another origin cannot read the API (no CORS permission is ever granted) | `e2e-django/auth.spec.js` |
| Cross-user isolation with cookies: one person cannot read, change or delete another's data by exact id | `e2e-django/planner.spec.js`, backend tests |
| API answers are `no-store` / `no-referrer` | `e2e-django/auth.spec.js`, backend tests |
| Form-encoded and plain-text POSTs (what a cross-site HTML form can send) are refused with 415 before reaching any view | backend tests |
| In production settings the cookie is `Secure`; `SameSite=Strict`, `Path=/api/` and CORS-without-credentials do not change | backend tests (settings loaded as production). **The `Secure` flag in a real HTTPS browser is unverified.** |
| The names the browser and server must agree on (cookie, CSRF header) cannot drift | `tests/integration/authContract.integration.test.js` |
| The UI sends the CSRF header on every write (the fast browser suite's stub refuses a write without it) | `npm run test:e2e` (96 tests) |

## 4. Remaining risks and open items

- **HTTPS is unverified.** Local tests run over HTTP, where the cookie is not `Secure` by design. Until it runs behind real HTTPS, `Secure`, HSTS, and the proxy's `Host`/`X-Forwarded-Proto` handling that Django's CSRF check relies on are untested. See `docs/DEPLOYMENT.md`.
- **Login/registration CSRF** (an attacker making a victim's browser sign in as the attacker) is blocked by layers rather than a token: those endpoints accept **JSON only** (a form post gets 415), and JSON from another origin needs a CORS preflight that is never granted. It is not protected by a CSRF token. Acceptable here; revisit if the API ever accepts form encodings.
- **Cookie prefix hardening not used.** `__Host-` (Secure, Path=/, no Domain) is stricter but conflicts with the `/api/` path restriction; the `/api/` path was preferred.
- **Subdomains:** host the app on a domain whose other subdomains you control; do not set a `Domain` attribute (none is set).
- **No renewal or idle timeout:** a session lasts its full lifetime from sign-in. Shorter lifetime (7-14 days) is a one-line configuration change; recommended before launch.
- **Bearer support remains**, with no browser using it. It exists for tools, tests and a possible native app. Remove it (keep `transport` cookie-only and drop the header branch) when no non-browser client needs it; that deletes code and one authentication path but breaks `verify:django`'s default and ~100 backend tests that sign in by header.
- **Not done:** per-session list and "sign out everywhere" in the UI; device names; step-up re-authentication for sensitive actions (deleting an account does re-ask the password).
- **Cross-origin deployment is not supported for browsers** by design (credentialed CORS is never enabled). If the app and API must be on unrelated domains, this design does not work and would need `SameSite=None; Secure` plus credentialed CORS, which browsers increasingly block; the previous bearer-in-`localStorage` design would then be the fallback (code and decision in Git history).

## 5. Other findings (carried over, still true)

| Area | Finding | Status |
| --- | --- | --- |
| `ALLOWED_HOSTS`, secret key, https frontend address | The server refuses to start in production without them | Verified |
| Password reset | Same answer for known and unknown addresses; single use; one hour; secret removed from the address bar; a failing mail server no longer reveals which addresses exist | Verified. **Timing:** a real account's request sends mail and is slower; not hidden |
| Registration | Reveals that an address is taken (`docs/EMAIL_DECISIONS.md`) | Known trade-off |
| Rate limiting | Auth endpoints, per client address; behind a proxy that is the proxy's address unless forwarded; no lockout | Known |
| Secrets | In the environment only; not logged; a test checks the settings hold no literal | Verified |
| Admin | `/admin/` enabled; it uses Django's own session and CSRF (separate from the API) | Restrict or disable in production |
| Dependencies | `npm audit` / `pip audit` not run | Recommended before launch |
