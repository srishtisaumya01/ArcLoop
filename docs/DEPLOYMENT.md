# Deployment preparation

Nothing here has been deployed, and nothing in this repository deploys. This is what a deployment has to get right. Every item marked **blocker** must be settled before real users sign up.

Arcloop is two parts: the React build (static files) and the Django API (`backend/`, SQLite). They live on different origins, so the browser talks to the API across origins.

## 1. Environment variables

### API (`backend/`, set in the real environment or a git-ignored `backend/.env`)

| Variable | Required | Meaning |
| --- | --- | --- |
| `DJANGO_DEBUG` | yes, **must be `false`** | Anything else enables debug pages and the development-only defaults. |
| `DJANGO_SECRET_KEY` | **yes** | Signs password-reset links and sessions. The server refuses to start in production without it. Generate: `python -c "import secrets; print(secrets.token_urlsafe(50))"`. Treat it like a password: never commit it, never put it in a `VITE_` variable, never log it. Changing it invalidates every outstanding password-reset link (sign-in tokens are unaffected: they are random and stored hashed). |
| `DJANGO_ALLOWED_HOSTS` | **yes** | Comma-separated host names the API answers to, e.g. `api.example.com`. |
| `CORS_ALLOWED_ORIGINS` | **yes** | Comma-separated origins of the frontend, e.g. `https://app.example.com`. Only these origins may call the API from a browser. No wildcards, no credentials (tokens are headers, never cookies). |
| `FRONTEND_URL` | **yes** | Base address used in password-reset email links, e.g. `https://app.example.com`. |
| `DJANGO_DB_PATH` | recommended | Absolute path of the SQLite file, on a persistent disk (not inside a release folder that is replaced on deploy). |
| `DJANGO_EMAIL_HOST`, `DJANGO_EMAIL_PORT`, `DJANGO_EMAIL_HOST_USER`, `DJANGO_EMAIL_HOST_PASSWORD`, `DJANGO_EMAIL_USE_TLS`, `DJANGO_FROM_EMAIL` | **yes** (for password reset) | SMTP for reset emails. Credentials come only from the environment. Without a mail host the server warns at start-up and a reset request cannot deliver. |
| `DJANGO_TOKEN_LIFETIME_DAYS` | no (30) | Sign-in token lifetime. |
| `DJANGO_AUTH_THROTTLE` | no (`30/min`) | Rate limit for the public auth endpoints, per client address. |
| `DJANGO_HSTS_SECONDS` | recommended | HSTS lifetime in seconds (default 0 = off). Raise (e.g. 31536000) only once HTTPS works everywhere; browsers cache it. `DJANGO_HSTS_INCLUDE_SUBDOMAINS=true` is an optional extra that depends on your domain layout. |
| `DJANGO_BEHIND_PROXY` | when behind a TLS proxy | `true` makes Django trust `X-Forwarded-Proto` (only enable if such a proxy is really in front). |
| `DJANGO_SECURE_SSL_REDIRECT` | no (true) | Redirects HTTP to HTTPS when not in debug. Turn off only if a proxy already does it and forwards the scheme correctly. |

**Never set in production:** `ARCLOOP_TEST_CLOCK` (the server refuses it unless debug is on, but do not rely on that), `DJANGO_EMAIL_BACKEND` pointing at the console or file backends.

### Frontend build (public by design: everything `VITE_` is shipped to every browser)

| Variable | Meaning |
| --- | --- |
| `VITE_API_BASE_URL` | The API's public address, e.g. `https://api.example.com/api/v1`. The only variable the app reads. In development it defaults to `http://127.0.0.1:8000/api/v1`. |

No secret ever belongs in a `VITE_` variable.

## 2. Secrets

- The secret key and SMTP password live only in the host's secret store or environment. Not in Git, not in the frontend, not in logs or error reports. The API never prints them; `manage.py check --deploy` does not either.
- Rotate the SMTP password if it was ever pasted into a chat, ticket or terminal history.
- Sign-in tokens are stored hashed. A database backup is therefore not a set of working sign-ins, but it does contain emails, password hashes and every user's plans: protect backups like the database itself.

## 3. HTTPS and headers

- Serve both the frontend and the API over HTTPS only. With `DJANGO_DEBUG=false` the API sets secure cookies, `nosniff` and redirects to HTTPS (see `config/settings.py`). Behind a proxy that terminates TLS, the proxy must pass `X-Forwarded-Proto` and `DJANGO_BEHIND_PROXY=true` must be set.
- HSTS is configurable (`DJANGO_HSTS_SECONDS`) but off by default. **Blocker:** a Content-Security-Policy at the frontend host is not configured. The session token is in `localStorage`, so a CSP that blocks injected script is the main defence against it being read.
- Run `cd backend && DJANGO_DEBUG=false DJANGO_SECRET_KEY=… DJANGO_ALLOWED_HOSTS=… python manage.py check --deploy` and resolve what it reports.

## 4. CORS

The frontend and API are on different origins, so the API must allow the frontend's origin (`CORS_ALLOWED_ORIGINS`) and nothing else. The browser tests (`npm run test:e2e:django`) prove the API answers its own frontend's origin and does not advertise itself to another origin; they do not prove your production origins are correct. After deploying, load the app from the real origin and confirm sign-in works.

## 5. SQLite: what it is good for, and its limits

SQLite is a single file written by one process at a time. The API enables WAL mode and immediate transactions, so simultaneous requests queue (up to 20 seconds) instead of failing; the browser tests exercise this.

It suits **one API server on one machine with a local disk and modest traffic**. It does **not** suit:

- more than one API instance sharing the file (network filesystems and SQLite locking do not mix: corruption is possible);
- serverless or container platforms with ephemeral or shared disks;
- heavy concurrent writing (every write takes a database-wide lock);
- point-in-time recovery or replication (there are none: your recovery point is your last backup).

If growth makes any of these matter, move to PostgreSQL: the models are plain Django and `settings.DATABASES` is the only change, plus loading the data (`dumpdata` / `loaddata`, or a PostgreSQL migration tool).

WAL mode creates `db.sqlite3-wal` and `db.sqlite3-shm` beside the database. They are part of the database while it is open: never copy or delete just the main file of a live database.

## 6. Backup and restore

**Back up** with SQLite's own online backup, which is consistent while the API runs:

```bash
sqlite3 /var/lib/arcloop/db.sqlite3 ".backup '/var/backups/arcloop/db-$(date +%F-%H%M).sqlite3'"
```

(If `sqlite3` is not installed: `python manage.py dbshell` is not enough; use Python: `import sqlite3; src = sqlite3.connect(path); dst = sqlite3.connect(out); src.backup(dst)`.)

- Schedule it (at least daily; more often if losing a day of plans matters), keep several generations, and copy them **off the machine** (another disk or object storage), encrypted.
- A backup holds personal data. Apply the same access control and retention rules as the live database.
- **Test the restore.** An untested backup is not a backup.

**Restore:**

1. Stop the API (so nothing writes).
2. Keep the damaged files for investigation (`mv db.sqlite3 db.sqlite3.broken`, same for `-wal` and `-shm`).
3. Copy the chosen backup to the database path and make sure the API's user owns it.
4. Start the API, run `python manage.py migrate` (a no-op for a current backup; it brings an older backup up to date) and `python manage.py check`.
5. Sign in with a test account and open My Day and Week.

Account deletion removes a user's rows from the live database only. Backups taken earlier still contain them until they expire: state this in the privacy policy and set a backup retention period.

## 7. Release steps (outline)

1. Build the frontend with `VITE_API_BASE_URL` set to the production API; publish `dist/` to static hosting (single-page-app fallback to `index.html`).
2. Install `backend/requirements.txt` in a virtualenv on the API host; run the API with a production server (gunicorn or uvicorn behind a TLS-terminating proxy), not `runserver`.
3. `python manage.py migrate`; `python manage.py collectstatic` if the admin is used (it is unstyled otherwise); `createsuperuser` only if needed.
4. Run the checks above, then the smoke test: register, plan a day, complete a task, reload, log out, request a password reset, delete the test account.

## 8. Known blockers before real users

- No Content-Security-Policy; HSTS is available but off until HTTPS is confirmed (section 3). `manage.py check --deploy` with production-style settings reports only two optional HSTS extras (include-subdomains, preload).
- No SMTP provider chosen or tested; password reset has only been proven with the file email backend.
- No email confirmation at sign-up (registering signs the user in): decide whether that is acceptable.
- Privacy Policy and Terms are unreviewed drafts and do not yet describe backups or deletion.
- No monitoring, error reporting or log retention plan. The API logs unhandled errors to the process output.
- No rate limiting beyond the auth endpoints; no account lockout.
- The Django admin is enabled at `/admin/`; restrict it by network or disable it in production if it is not needed.
