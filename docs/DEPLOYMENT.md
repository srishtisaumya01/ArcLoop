# Deployment preparation

**Nothing has been deployed, and nothing in this repository deploys.** This is what a deployment has to get right, what has been verified locally, and what cannot be verified until a real HTTPS deployment exists. Items marked **blocker** must be settled before real users sign up. Production HTTPS readiness is **unverified**: local HTTP tests prove nothing about it.

Arcloop is two parts: the React build (static files) and the Django API (`backend/`, SQLite). Related documents: `AUTH_SECURITY.md` (token storage, cookies, CSP), `BACKUP_RESTORE.md`, `EMAIL_DECISIONS.md`, `REMINDERS.md`, `SECURITY.md`.

## 1. Environment variables

### API (`backend/`: the real environment or a git-ignored `backend/.env`)

| Variable | Required | Meaning |
| --- | --- | --- |
| `DJANGO_DEBUG` | yes, **must be `false`** | Anything else enables debug pages and development-only defaults |
| `DJANGO_SECRET_KEY` | **yes** | Signs password-reset links. The server refuses to start without it. Generate: `python -c "import secrets; print(secrets.token_urlsafe(50))"`. Never in Git, a `VITE_` variable or a log. Changing it invalidates outstanding reset links (sign-in tokens are unaffected: random, stored hashed) |
| `DJANGO_ALLOWED_HOSTS` | **yes** | Comma-separated API host names, e.g. `api.example.com`. The server refuses to start without it |
| `FRONTEND_URL` | **yes** | The app's address, **must start with `https://`** (used in reset links). The server refuses to start otherwise |
| `CORS_ALLOWED_ORIGINS` | **no** (leave empty) | Not needed in the same-origin layout (section 4). If set: exact origins, no wildcards, credentials never allowed |
| `DJANGO_DB_PATH` | recommended | Absolute path of the SQLite file on a persistent disk |
| `DJANGO_BACKUP_DIR` | recommended | Where `backup_db` writes; **not** on the database's disk (`BACKUP_RESTORE.md`) |
| `DJANGO_EMAIL_HOST`, `_PORT`, `_HOST_USER`, `_HOST_PASSWORD`, `_USE_TLS`, `DJANGO_FROM_EMAIL` | **yes** for password reset | SMTP; credentials only from the environment. No provider chosen yet (`EMAIL_DECISIONS.md`). Without a host the server warns at start-up |
| `DJANGO_PASSWORD_RESET_TIMEOUT` | no (3600) | Seconds a reset link lasts |
| `DJANGO_TOKEN_LIFETIME_DAYS` | no (**7**) | Session lifetime from sign-in, fixed, no renewal. Also sets the cookies' Max-Age (`AUTH_SECURITY.md`) |
| `DJANGO_AUTH_THROTTLE` | no (`30/min`) | Rate limit of the public auth endpoints, per client address |
| `DJANGO_CSP_REPORT_THROTTLE` | no (`60/min`) | Rate limit of the CSP report endpoint |
| `DJANGO_LOG_LEVEL` | no (INFO) | Root log level |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | only if the admin is on another https origin | Comma-separated origins |
| `DJANGO_HSTS_SECONDS` | **only after HTTPS is confirmed** | Default 0 (off). See section 3 |
| `DJANGO_HSTS_INCLUDE_SUBDOMAINS` | optional, after thought | Applies HSTS to every subdomain |
| `DJANGO_BEHIND_PROXY` | when a TLS-terminating proxy is in front | Trusts `X-Forwarded-Proto`. Only with such a proxy: a client could forge it otherwise |
| `DJANGO_SECURE_SSL_REDIRECT` | no (true) | Redirects HTTP to HTTPS in production |

**Never set in production:** `ARCLOOP_TEST_CLOCK` (the server refuses it unless debug is on), `DJANGO_EMAIL_BACKEND` pointing at the console or file backends.

### Frontend build (public by design: everything `VITE_` ships to every browser)

`VITE_API_BASE_URL` is the only variable the app reads, and it is **optional**: the default is the same-origin `/api/v1` (section 4). No secret ever belongs in a `VITE_` variable; tests enforce that only this one is read, by static name.

## 2. Secrets

- The secret key and SMTP password live only in the host's secret store or environment. Never in Git, the frontend, logs or error reports. The API never prints them (`manage.py check --deploy` does not either); a test checks the settings file holds no literal secret.
- Rotate the SMTP password if it was ever pasted into a chat, ticket or terminal history.
- Sign-in tokens are stored hashed. A database backup is not a set of working sign-ins, but it holds emails, password hashes and every user's plans: protect it like the database.

## 3. HTTPS, headers, CSP

**HTTPS is unverified until you have deployed and tested it.** Production mode turns on secure cookies, the HTTP-to-HTTPS redirect and `nosniff`; HSTS is **off** by default.

**Enable HSTS only when** every page of the app and API works over HTTPS on the real domain, certificates renew automatically, and you are ready for browsers to refuse plain HTTP for the lifetime you set. Start small: `DJANGO_HSTS_SECONDS=300`, confirm, then raise to `86400`, then `31536000`. It cannot be undone quickly. The frontend host's HSTS header is configured at that host, not in Django.

**Content-Security-Policy (frontend host, a blocker until configured).** The policy is defined once in `deploy/securityHeaders.js`. Print the exact headers (an API address argument is only for a different-origin API, which cookie sessions do not support):

```bash
npm run -s csp:print -- --report-only --https            # app and API on one origin (the supported layout)
npm run -s csp:print -- --report-only --https --nginx    # the same, as nginx add_header lines
```

Roll out in two steps:
1. **Report-only first** (`--report-only`): send `Content-Security-Policy-Report-Only` from the frontend host for a few days. Violations are sent to the API's `POST /api/v1/csp-report/` and appear in the log as `event=csp_violation` (directive, kind of blocked resource and the page path only; no query strings). Expect none: the production build was run under the enforced policy in Chromium with zero violations across every page (`npm run test:e2e:csp`). Real users bring extensions and other browsers, which can produce noise.
2. **Enforce** (no `--report-only`) once clean. Keep `report-uri` so later regressions show up.

What the policy is: `default-src 'none'`; scripts, fonts, images, manifests only from the app's own origin; `connect-src` the app and the API; `style-src 'self'` plus the **hash of the empty string**, which lets Emotion's empty `<style>` tags exist while injected CSS is refused (a nonce cannot work on static hosting: a fixed one is readable by anyone); no `unsafe-inline`, no `unsafe-eval`, no `data:`; `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`. Tests assert none of the unsafe keywords appear and that injected inline script, inline handlers, inline style markup and foreign requests are blocked.

Limits: verified in Chromium against `vite preview` only. **Firefox and Safari were not tested.** The policy covers the production build, not the dev server. The headers must actually be sent by the host: check with `curl -I https://app.example.com/` after deploying.

Also send from the frontend host: `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` (all printed by `csp:print`), and serve the single-page-app fallback to `index.html`.

The API sets its own headers on every `/api/` response (no-store, no-referrer, a lock-down CSP, nosniff): tested.

Behind a proxy: pass `X-Forwarded-Proto` and an **overwritten** `X-Forwarded-For`, and set `DJANGO_BEHIND_PROXY=true` (section 4). The client address used by rate limiting and the security log is then the proxy-supplied one; without the flag it is the connection's own address and a client-sent `X-Forwarded-For` is ignored (tested).

Run `cd backend && DJANGO_DEBUG=false DJANGO_SECRET_KEY=... DJANGO_ALLOWED_HOSTS=... FRONTEND_URL=https://... CORS_ALLOWED_ORIGINS=... python manage.py check --deploy` and resolve what it reports. With production-style settings and HSTS configured it reports only two optional HSTS extras (include-subdomains, preload) that depend on your domain layout.

## 4. One site: app and API on the same origin (the supported layout)

Browser sign-in uses an HttpOnly cookie (`AUTH_SECURITY.md`), so the app and API **must share an origin**: serve the static build and route `/api/` to Django through one reverse proxy. The app calls `/api/v1/...` by default, so `VITE_API_BASE_URL` is not needed. Locally, `npm run dev` and `npm run preview` do exactly this (`/api` proxied to `ARCLOOP_API_PROXY`, default `http://127.0.0.1:8000`).

The example is `deploy/nginx.example.conf` (HTTP-to-HTTPS redirect, TLS, `/api/` proxy, long-cache `/assets/`, no-cache SPA fallback, request-size limit, and the security headers included from a file generated by `npm run -s csp:print -- --https --nginx`). Why each line is there:

- `proxy_pass http://127.0.0.1:8000;` with **no URI**, so `/api/...` reaches Django unchanged.
- `proxy_set_header Host $host;` Django's CSRF Origin check compares the browser's `Origin` with the request host.
- `proxy_set_header X-Forwarded-Proto $scheme;` read only with `DJANGO_BEHIND_PROXY=true`; without it Django sees plain HTTP and redirects forever (`SECURE_SSL_REDIRECT`).
- `proxy_set_header X-Forwarded-For $remote_addr;` **overwrites** the header. Rate limiting and the security log use it when `DJANGO_BEHIND_PROXY=true` (`NUM_PROXIES=1`); appending (`$proxy_add_x_forwarded_for`) would let a client choose its own address.
- `client_max_body_size 1m;` the proxy caps request size first; Django also enforces its own limit (`DATA_UPLOAD_MAX_MEMORY_SIZE`, answered with `413`) as the second line.
- Security headers are `include`d in each `location`, because `add_header` in a location discards the ones inherited from the server block; `always` puts them on error pages too.

Requirements: `DJANGO_ALLOWED_HOSTS=app.example.com`, `FRONTEND_URL=https://app.example.com`, `DJANGO_BEHIND_PROXY=true`; the proxy must preserve `Host`. If the public host differs from what Django sees, add the public origin to `DJANGO_CSRF_TRUSTED_ORIGINS`. **`CORS_ALLOWED_ORIGINS` is not needed and should stay empty**; credentialed cross-origin access is never enabled. The session cookie is `Secure` in production, so it is only sent over HTTPS; sign-in will not persist on plain HTTP. For the CSP, `csp:print` without an API address gives `connect-src 'self'`.

**Checked so far (not production):** `nginx -t` accepted the file (nginx 1.28.0, Windows build, paths swapped for a scratch folder), and a rehearsal ran it with a **self-signed local certificate** in front of the real Django server in production mode (see section 10). That proves the config's assumptions about this app, not that your host, certificate, DNS, firewall or real HTTPS work. **Production verification is pending.** After deploying, sign in, reload, log out, and confirm in the browser's storage view that `arcloop_session` is HttpOnly + Secure + SameSite=Strict.

If the app and API must be on unrelated domains, this design does not apply (`AUTH_SECURITY.md`, section 4).

## 5. SQLite: what it is good for, and its limits

One API server on one machine, local disk, modest traffic. WAL mode and immediate transactions make simultaneous requests queue (up to 20 seconds) instead of failing. It does **not** suit more than one API instance sharing the file, network or ephemeral/shared disks, heavy concurrent writing, or anything needing replication or point-in-time recovery. Growth path: PostgreSQL (`settings.DATABASES` plus `dumpdata`/`loaddata`). WAL creates `-wal` and `-shm` files beside the database: never copy or delete just the main file of a live database.

## 6. Backup and restore

Use the tested commands in **`BACKUP_RESTORE.md`** (`backup_db`, `restore_db`, `verify_db`). Verified on disposable databases only; **a drill on the real setup, with the backup fetched back from off-machine storage, has not been done and must be before recovery is called tested.** Frequency, retention, off-machine storage, encryption and the limits (recovery point, deleted accounts surviving in backups, stale sessions after a restore) are in that document.

## 7. Monitoring (minimum viable; no external provider chosen or added)

Everything here uses what exists: the process log, the `arcloop.*` loggers, `GET /api/v1/health/` and `manage.py verify_db`. Choosing a monitoring provider (an uptime service, log shipping, error tracking) needs your authorisation: list the data each would receive first (logs contain client addresses; error reports could contain request data).

| Need | How | Alert when |
| --- | --- | --- |
| **API is up and the database answers** | An uptime check on `GET https://api.example.com/api/v1/health/` every 1-5 minutes (200 `{"status":"ok"}`, 503 when the database fails; says nothing else) | Not 200 twice in a row |
| **Django errors** | `django.request` logs 5xx at ERROR with a traceback to the process output; unhandled API exceptions are logged server-side and answered with a generic `server_error` | Any ERROR line from `django.request`; rising 5xx rate |
| **Failed requests** | Access log of the WSGI/ASGI server or proxy | 5xx or 4xx spikes |
| **Authentication abuse** | `arcloop.security`: `login_failed` (WARNING), `rate_limited` (WARNING), `password_reset_failed`, `password_reset_requested`, `registered`, `account_deleted`. Count per client address. Behind a proxy the address is the proxy's unless forwarded | Many `login_failed` or any burst of `rate_limited` from one address; many `registered` per minute |
| **Reset email is broken** | `event=reset_email_failed error=<Type>` in `arcloop.security` | **Any occurrence**: nobody can reset a password |
| **Content-Security-Policy violations** | `event=csp_violation` | A new directive or page after a release |
| **Database and backup failures** | Cron `python manage.py verify_db --backup-dir $DJANGO_BACKUP_DIR` after each backup: non-zero exit if the database fails integrity, migrations are pending, the newest backup is missing/stale/damaged or does not match its checksum | Any non-zero exit; also alert if the cron job itself did not run |
| **Disk space** | The host's own metric (the database and its WAL grow; backups grow) | Under 20% free |
| **Certificate expiry** | Your TLS provider/monitor | 14 days |

Keep logs long enough to investigate (30 days is a reasonable start) and say so in the privacy policy; rotate them. The security log never contains passwords, tokens, reset links or email addresses (tested), but it does contain client network addresses.

Not built: alert routing, dashboards, a status page, an on-call process. Those are decisions for you.

## 8. Release steps (outline)

1. Build the frontend (`npm run build`; no API address needed); publish `dist/` to static hosting with the headers from section 3 and the SPA fallback.
2. Install `backend/requirements.txt` in a virtualenv on the API host; run the API with a production server (gunicorn or uvicorn behind a TLS-terminating proxy), **not** `runserver`.
3. Set the environment (section 1); `python manage.py migrate`; `python manage.py check --deploy`; `collectstatic` only if the admin is used; `createsuperuser` only if needed.
4. Schedule `backup_db` and `verify_db` (section 7) and **do the recovery drill** (`BACKUP_RESTORE.md` section 6).
5. Smoke test on the real domain with throwaway accounts: register, plan a day, complete a task, reload, log out, request a password reset (email arrives, link works once), delete the test account; check the response headers and that the browser console shows no CSP violations.

## 9. Blockers and unverified items before real users

- **HTTPS, HSTS and the frontend security headers are not configured or tested on any real host.**
- **No SMTP provider chosen; password-reset delivery has never been exercised for real** (`EMAIL_DECISIONS.md`).
- **No recovery drill on the real setup; no scheduled backups; no off-machine storage** (`BACKUP_RESTORE.md`).
- **No monitoring provider or alerting; no on-call process.**
- **Verified email is required before any shared feature, invitation, group or public sign-up** (`EMAIL_DECISIONS.md`). Not built; not needed for the private beta.
- Sessions are an HttpOnly cookie behind a same-origin proxy: verified locally over HTTP in Chromium only; `Secure`, the proxy's `Host`/`X-Forwarded-Proto` handling and HTTPS are unverified (`AUTH_SECURITY.md`).
- Calendar export (`CALENDAR_EXPORT.md`) was never imported into a real calendar app.
- Privacy Policy and Terms are unreviewed drafts; a proposed update exists (`PRIVACY_POLICY_PROPOSAL.md`) but is not published.
- Reminders are delivered only while the app is open (`REMINDERS.md`).
- Firefox, WebKit/Safari, physical phones and offline use are untested; dependency audits were run on 18 October 2026 (`npm audit`: 0 vulnerabilities; `pip-audit`: DRF advisories fixed by the tested upgrade to 3.17.2; see `KNOWN_ISSUES.md`) and must be repeated before launch.
- The Django admin is enabled at `/admin/`: restrict it by network or disable it in production if unneeded.
- Rate limiting covers the auth endpoints only; there is no account lockout, MFA or CAPTCHA.

## 10. Production verification checklist (run on the real host, over real HTTPS)

Local HTTP tests and the self-signed rehearsal below do **not** satisfy these. Every item is a launch gate. Use a throwaway account; paste no secrets anywhere.

| Gate | How to check | Expected |
| --- | --- | --- |
| HTTPS only | `curl -sI http://app.example.com/` | `301` to `https://...`; the site also works only over HTTPS |
| Valid certificate and renewal | Browser padlock; `curl -sI https://app.example.com/`; `openssl s_client -connect app.example.com:443 -servername app.example.com </dev/null \| openssl x509 -noout -dates`; confirm automatic renewal is scheduled | No warning; expiry well ahead |
| Trusted hosts | `curl -s -o /dev/null -w "%{http_code}" -H "Host: other.example" https://<server-ip>/api/v1/health/ -k`; and `DJANGO_ALLOWED_HOSTS` lists only the real host | `400` for an unlisted Host |
| `X-Forwarded-Proto` | `DJANGO_BEHIND_PROXY=true`; `curl -sI https://app.example.com/api/v1/health/` must not redirect; direct to Django on its private port without the header must redirect (so it is not publicly reachable) | `200`, no redirect loop; Django port firewalled from the internet |
| Secure session cookie | Sign in; `curl -si -H 'Origin: https://app.example.com' -H 'Content-Type: application/json' -d '{"email":"...","password":"...","transport":"cookie"}' https://app.example.com/api/v1/auth/login/` (or browser dev tools, Application > Cookies) | `arcloop_session`: `HttpOnly; Secure; SameSite=Strict; Path=/api/`, Max-Age about 604800; `arcloop_csrf`: `Secure; SameSite=Strict`; no token in the body |
| CSRF through the proxy | Same cookies: a write without `X-CSRFToken` and a write with a foreign `Origin` | `403` both; with the right header and Origin, success |
| Logout and expiry | Log out; replay the copied cookie | `401` |
| HSTS | Only after everything above works for days: `DJANGO_HSTS_SECONDS=300`, then raise (section 3); `curl -sI https://app.example.com/ \| grep -i strict-transport` (set at the frontend host) | Header present with the chosen value |
| CSP report-only, then enforced | `curl -sI https://app.example.com/ \| grep -i content-security`; load every page with the console open; watch `event=csp_violation` in the log | Report-only first with no unexplained violations, then `Content-Security-Policy` enforced; `report-uri` kept |
| Other headers | `curl -sI https://app.example.com/` | `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` present; API answers `Cache-Control: no-store` |
| Client address | Make a failed login from a known address; read the `event=login_failed ip=` line | Your address, not the proxy's |
| `manage.py check --deploy` | Command in section 3 | Only the optional HSTS extras |

### Rehearsal that was run (local, not production)

A real nginx 1.28.0 with a throwaway self-signed certificate (port 8443, host name mapped by `curl --resolve`) in front of the real Django server with production settings (`DJANGO_DEBUG=false`, `DJANGO_BEHIND_PROXY=true`, allowed host `app.example.com`, temporary database), driven by `curl` (not a browser): HTTP redirected to HTTPS; registration returned `201` with `arcloop_session` as `HttpOnly; Secure; SameSite=Strict; Path=/api/; Max-Age=604799` and `arcloop_csrf` as `Secure; SameSite=Strict`, no token in the body; `/auth/me/` worked; a write without the CSRF header got `403`, a write with the header but a foreign Origin got `403`, with both right `201`; logout `204` then the same cookie `401`; the app and unknown paths carried the report-only CSP and the other headers with `no-cache`; the API answered `no-store` with its own CSP; direct access to Django without the forwarded protocol header was redirected, an unlisted Host got `400`; a 2 MB body got `413` from the proxy; a client-sent `X-Forwarded-For` was overwritten by the proxy. The real browser app was **not** run through this proxy, and a self-signed certificate is not a deployment. The scratch servers were stopped and the temporary database deleted.
