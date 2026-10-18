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
| Expiry (policy: **7 days**) | There is one credential, no separate access/refresh token and no rotation. It is valid for `DJANGO_TOKEN_LIFETIME_DAYS` (default **7**) from sign-in, fixed: using it does not extend it, so a person signs in again at least weekly. The **server-side expiry decides validity**; the cookie's `Max-Age` (and the CSRF cookie's age) is only derived from it and can never outlive it, and a browser that keeps an expired cookie is refused. An expired, revoked or unknown cookie gets a `401` whose answer also clears it | `accounts/models.py`, `config/auth_cookies.py`, `accounts/authentication.py`, `config/errors.py` |
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
| Register and log in set an HttpOnly, SameSite=Strict, Path=/api/ cookie with a 7-day expiry; the body has no token; `document.cookie`, `localStorage` and `sessionStorage` contain no credential; the CSRF cookie *is* readable | `e2e-django/auth.spec.js`, `backend/tests/test_cookie_auth.py` |
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
| Session lifetime: default 7 days in the settings, the stored expiry, the reported `expires_at` and both cookies' Max-Age; use does not extend it; works on day 6, refused (and cookie cleared) after day 7 even with a valid CSRF token; one setting moves everything | `backend/tests/test_cookie_auth.py` (`SessionLifetimeTests`, real Django stack, time simulated by moving the stored expiry; no browser waits 7 days) |
| The cookie a real browser stores lasts about 7 days | `e2e-django/auth.spec.js` |
| The UI sends the CSRF header on every write (the fast browser suite's stub refuses a write without it) | `npm run test:e2e` (96 tests) |

## 4. Remaining risks and open items

- **HTTPS is unverified.** Local tests run over HTTP, where the cookie is not `Secure` by design. Until it runs behind real HTTPS, `Secure`, HSTS, and the proxy's `Host`/`X-Forwarded-Proto` handling that Django's CSRF check relies on are untested. See `docs/DEPLOYMENT.md`.
- **Login/registration CSRF** (an attacker making a victim's browser sign in as the attacker) is blocked by layers rather than a token: those endpoints accept **JSON only** (a form post gets 415), and JSON from another origin needs a CORS preflight that is never granted. It is not protected by a CSRF token. Acceptable here; revisit if the API ever accepts form encodings.
- **Cookie prefix hardening not used.** `__Host-` (Secure, Path=/, no Domain) is stricter but conflicts with the `/api/` path restriction; the `/api/` path was preferred.
- **Subdomains:** host the app on a domain whose other subdomains you control; do not set a `Domain` attribute (none is set).
- **No renewal or idle timeout:** a session lasts exactly seven days from sign-in (decided for the private beta), then the person signs in again. Revisit if weekly sign-in proves annoying: a renewal scheme would have to be designed (and tested) rather than just lengthening the lifetime.
- **Legacy bearer authentication is retained (decision).** Census of what depends on it, by search of the repository:
  - **Browser app, frontend services, `verify:django`, the Playwright stub and the integration harness: none.** All ask for `transport: "cookie"`.
  - **Backend tests: yes.** `ApiCase.as_user` (`backend/tests/base.py`) signs tests in with a bearer header, and `test_auth`, `test_planner`, `test_account_deletion`, `test_security` and `test_timezones` use it, plus tests of the bearer path itself (header wins over cookie, no CSRF needed, garbage and expired headers). Replacing it means moving those tests to cookie sign-in with CSRF headers.
  - **Deployed or external clients: none exist** (nothing is deployed), but that cannot be *proven* for the future: scripts, tools and a possible native app would use it.
  - Retained because the condition for removal (no active client requires it, proven) is not met for the test infrastructure and future clients, and it adds no browser-reachable weakness: the token is returned only by sign-in/registration with the default `transport` (which needs the password), no endpoint turns an existing cookie session into a token, and a cookie-authenticated write still needs CSRF. To remove it later: drop the header branch in `TokenAuthentication._credential`, the `token` transport, `as_user`, and convert the tests.
  - Security caveat: while it exists, the default transport of login/register is `token`; a future client that forgets `transport` receives a token in the body. Acceptable for the private beta.
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
| Dependencies | 18 Oct 2026: `npm audit` 0 vulnerabilities (all and production-only). `pip-audit` first found 2 in `djangorestframework 3.16.1`, both fixed in 3.17.2 (checked against OSV: GHSA-2m8g-3cmr-wg3w, GHSA-g47c-3xmw-q6m2; 3.17.2 lists Django 5.2 support). **Resolved by upgrading** the pin to `>=3.17.2,<3.18` after testing (full suites, below), not by the proxy limit. `AdminRenderer` finding: the renderer configuration is JSON-only, so it would not have applied either. `pip-audit` on the upgraded set: no known vulnerabilities. Audits cover known advisories only | Repeat before launch |
| Client address | Rate limiting no longer trusts a client-sent `X-Forwarded-For`: `NUM_PROXIES` is 0, or 1 with `DJANGO_BEHIND_PROXY=true` (the proxy must overwrite the header). The security log uses the same address. Before this change DRF trusted the header unconditionally, so a client could have dodged the auth rate limit by inventing addresses | Fixed and tested (`backend/tests/test_security.py`) |

## 6. Email verification before shared features (requirement, not built)

Immediate sign-in after registration stays for the private beta (`EMAIL_DECISIONS.md`). **Verified email becomes mandatory before any of: shared plans, invitations, groups, public sign-up.** Reason: without it anyone can register with an address they do not own, so an invitation or share could reach, or be attributed to, the wrong person, and account recovery by email would be unreliable. Before building: choose and test an SMTP provider (no credential or real email was used in this phase), then add a verified flag, a single-use expiring confirmation link, resend limits, a rule in login or at the sharing boundary, UI states, and tests. Not introduced now.

## 7. Launch gates (all still open)

Real HTTPS, `Secure` cookie in a real browser, trusted hosts, `X-Forwarded-Proto`, HSTS and an enforced CSP have **not** been verified on any real host. The exact checks are in `DEPLOYMENT.md` section 10. A local rehearsal (real nginx, self-signed certificate, production-mode Django, `curl`) exercised the proxy assumptions, but it is not a deployment and was not a browser test.
