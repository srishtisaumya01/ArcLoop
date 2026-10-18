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
| `DJANGO_TOKEN_LIFETIME_DAYS` | no (30) | Sign-in token lifetime. Consider 7-14 (`AUTH_SECURITY.md`) |
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

**Content-Security-Policy (frontend host, a blocker until configured).** The policy is defined once in `deploy/securityHeaders.js`. Print the exact headers for your API address:

```bash
npm run csp:print -- https://api.example.com/api/v1 --report-only --https
```

Roll out in two steps:
1. **Report-only first** (`--report-only`): send `Content-Security-Policy-Report-Only` from the frontend host for a few days. Violations are sent to the API's `POST /api/v1/csp-report/` and appear in the log as `event=csp_violation` (directive, kind of blocked resource and the page path only; no query strings). Expect none: the production build was run under the enforced policy in Chromium with zero violations across every page (`npm run test:e2e:csp`). Real users bring extensions and other browsers, which can produce noise.
2. **Enforce** (no `--report-only`) once clean. Keep `report-uri` so later regressions show up.

What the policy is: `default-src 'none'`; scripts, fonts, images, manifests only from the app's own origin; `connect-src` the app and the API; `style-src 'self'` plus the **hash of the empty string**, which lets Emotion's empty `<style>` tags exist while injected CSS is refused (a nonce cannot work on static hosting: a fixed one is readable by anyone); no `unsafe-inline`, no `unsafe-eval`, no `data:`; `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`. Tests assert none of the unsafe keywords appear and that injected inline script, inline handlers, inline style markup and foreign requests are blocked.

Limits: verified in Chromium against `vite preview` only. **Firefox and Safari were not tested.** The policy covers the production build, not the dev server. The headers must actually be sent by the host: check with `curl -I https://app.example.com/` after deploying.

Also send from the frontend host: `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` (all printed by `csp:print`), and serve the single-page-app fallback to `index.html`.

The API sets its own headers on every `/api/` response (no-store, no-referrer, a lock-down CSP, nosniff): tested.

Behind a proxy: pass `X-Forwarded-Proto`, set `DJANGO_BEHIND_PROXY=true`, and make the proxy pass the real client address to the logs; otherwise rate limiting and the security log see only the proxy's address.

Run `cd backend && DJANGO_DEBUG=false DJANGO_SECRET_KEY=... DJANGO_ALLOWED_HOSTS=... FRONTEND_URL=https://... CORS_ALLOWED_ORIGINS=... python manage.py check --deploy` and resolve what it reports. With production-style settings and HSTS configured it reports only two optional HSTS extras (include-subdomains, preload) that depend on your domain layout.

## 4. One site: app and API on the same origin (the supported layout)

Browser sign-in uses an HttpOnly cookie (`AUTH_SECURITY.md`), so the app and API **must share an origin**: serve the static build and route `/api/` to Django through one reverse proxy. The app calls `/api/v1/...` by default, so `VITE_API_BASE_URL` is not needed. Locally, `npm run dev` and `npm run preview` do exactly this (`/api` proxied to `ARCLOOP_API_PROXY`, default `http://127.0.0.1:8000`).

Sketch (nginx-style; **not run or tested**, adapt to your host):

```nginx
server {
  listen 443 ssl;  server_name app.example.com;
  root /srv/arcloop/dist;                       # the static build
  location /api/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;                # Django's CSRF Origin check compares against this
    proxy_set_header X-Forwarded-Proto $scheme; # with DJANGO_BEHIND_PROXY=true
    proxy_set_header X-Forwarded-For $remote_addr;
  }
  location / { try_files $uri /index.html; add_header ...; }   # SPA fallback plus the headers from section 3
}
```

Requirements: `DJANGO_ALLOWED_HOSTS=app.example.com`, `FRONTEND_URL=https://app.example.com`, `DJANGO_BEHIND_PROXY=true`; the proxy must preserve `Host`. If the public host differs from what Django sees, add the public origin to `DJANGO_CSRF_TRUSTED_ORIGINS`. **`CORS_ALLOWED_ORIGINS` is not needed and should stay empty**; credentialed cross-origin access is never enabled. The session cookie is `Secure` in production, so it is only sent over HTTPS; sign-in will not persist on plain HTTP. For the CSP, `csp:print` without an API address gives `connect-src 'self'`.

**Unverified:** all of this on a real host with real HTTPS. After deploying, sign in, reload, log out, and confirm in the browser's storage view that `arcloop_session` is HttpOnly + Secure + SameSite=Strict.

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
- Decide email confirmation before adding anything shared between users (`EMAIL_DECISIONS.md`).
- Sessions are an HttpOnly cookie behind a same-origin proxy: verified locally over HTTP in Chromium only; `Secure`, the proxy's `Host`/`X-Forwarded-Proto` handling and HTTPS are unverified (`AUTH_SECURITY.md`).
- Calendar export (`CALENDAR_EXPORT.md`) was never imported into a real calendar app.
- Privacy Policy and Terms are unreviewed drafts; a proposed update exists (`PRIVACY_POLICY_PROPOSAL.md`) but is not published.
- Reminders are delivered only while the app is open (`REMINDERS.md`).
- Firefox, WebKit/Safari, physical phones and offline use are untested; `npm audit` and `pip audit` have not been run.
- The Django admin is enabled at `/admin/`: restrict it by network or disable it in production if unneeded.
- Rate limiting covers the auth endpoints only; there is no account lockout, MFA or CAPTCHA.
