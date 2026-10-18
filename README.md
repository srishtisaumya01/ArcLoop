# Arcloop

Build habits. Keep growing. A personal growth platform for planning your days, building habits, tracking honest progress, and growing with others. React + Vite + MUI on the front; Django + Django REST Framework + SQLite on the back.

**Core principle: progress, not perfection. A missed day is an event, not an identity. Progress should help people return, not make them feel guilty.**

The foundation feature is the **Daily Planning & Progress Engine**: people build their own daily plans (tasks, recurrence, rest and busy days), see one documented progress calculation, and revise plans without losing history. See [docs/DAILY_PLANNING_SPEC.md](docs/DAILY_PLANNING_SPEC.md).

## Getting started

You need Node 20+ and Python 3.12+. Two servers run side by side: the API (Django) and the app (Vite).

```bash
# 1. Frontend dependencies
npm install

# 2. Backend: virtualenv, dependencies, database
cd backend
python -m venv .venv
.venv/Scripts/activate            # Windows. macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env              # backend/.env; DJANGO_DEBUG=true is enough for local development
python manage.py migrate          # creates backend/db.sqlite3
python manage.py runserver        # API at http://127.0.0.1:8000/api/v1/

# 3. In a second terminal, from the repository root
npm run dev                       # app at http://localhost:5173
```

The app calls the same-origin `/api/v1`; `npm run dev` and `npm run preview` proxy `/api` to Django (`ARCLOOP_API_PROXY`, default `http://127.0.0.1:8000`), so no configuration is needed. In production a reverse proxy does the same (`docs/DEPLOYMENT.md`). Reminders page → "Add to a calendar" downloads an `.ics` file (`docs/CALENDAR_EXPORT.md`).

Password-reset emails are printed to the API's console in debug mode (nothing is sent). `python manage.py createsuperuser` gives access to the admin at `/admin/`.

The virtualenv, `backend/db.sqlite3`, `backend/.env` and `.env` are git-ignored. Never commit them.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` / `build` / `preview` | Vite dev server, production build into `dist/`, serve the build |
| `npm run lint` | ESLint |
| `npm test` | Both Vitest projects: `unit` (no server) and `integration` (starts a real Django server on a temporary SQLite file, so it needs the backend virtualenv) |
| `npm run test:unit` / `test:integration` | Just one of those |
| `npm run test:backend` | The Django test suite (103 tests: sign-in, planner rules, reminders, isolation, errors, account deletion, security headers and logging, server-side timezone edges, backup and restore on disposable databases) |
| `npm run test:e2e` | Playwright in Chromium (desktop 1440 and mobile 390) against the real dev server with an **in-memory stand-in for the API** and a pinned clock. UI behaviour, loading/empty/error states. Needs `npx playwright install chromium` once |
| `npm run test:e2e:django` | Playwright against the **real Django server and a real SQLite file**: sign-up, sign-in, logout, password reset by emailed link, CORS, a planner journey, persistence after reload, two users, account deletion |
| `npm run test:e2e:csp` | Builds the **production** bundle and serves it with the real Content-Security-Policy **enforced**; fails on any violation on any page, and proves the policy blocks injected script, inline handlers, inline styles and foreign requests |
| `npm run csp:print -- <API URL> [--report-only] [--https]` | Prints the security headers the frontend host must send (`deploy/securityHeaders.js`) |
| `npm run verify:django` | Starts a real server on a temporary database and runs a 23-step journey through the real services. Deletes the database afterwards |

Both Playwright configs start their own servers on their own ports and temporary databases; none of the tests touch `backend/db.sqlite3` or your `.env`.

## Email and sign-up behaviour

- **Registering signs the user in immediately.** There is no email-confirmation step: this is the intended behaviour for now (the project specification does not require one), and it is documented as a decision to revisit before launch (anyone can register any address). See [docs/DJANGO_MIGRATION.md](docs/DJANGO_MIGRATION.md).
- **Password reset** sends an email with a single-use link to the app. In development the email goes to the API console; the browser tests use a file backend. For real delivery, set the `DJANGO_EMAIL_*` variables in the API's environment (see `backend/.env.example` and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)). **No real email has ever been sent**, and no SMTP credentials are in the repository.
- **Deleting an account** (Settings, "Delete account") needs the password and the word `DELETE`, and permanently removes the account and everything it owns.

## Known limitations

- There is no offline mode. If the connection drops, pages not yet loaded show a calm "This page didn't load" message with a retry; data screens show their error state with a retry. Nothing is cached for offline use.
- Reminders are delivered only while Arcloop is open in a browser tab.
- Only Chromium has been run for browser tests; Firefox, WebKit/Safari, physical phones and offline use are untested.
- Backups: `python manage.py backup_db`, `restore_db`, `verify_db` (tested on disposable databases; a drill on a real setup is still to do): [docs/BACKUP_RESTORE.md](docs/BACKUP_RESTORE.md).
- SQLite suits one API server on one machine; see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for its limits, backups and the list of blockers before real users. **Nothing has been deployed.**
- Sessions are an HttpOnly cookie with CSRF protection, same-origin only; verified over HTTP locally, HTTPS unverified. A Content-Security-Policy at the host is required before launch. Calendar export is a one-time `.ics` file; calendar apps decide whether to alert (no notification is guaranteed).
- Full list: [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md).

## Design system

All visual values live in `src/theme/tokens.js` (colors, type scale, spacing, radii, shadows, widths, breakpoints, focus ring, motion). `src/theme/theme.js` maps them onto the MUI theme, including the shared button, card, accordion and focus styles. Components should use theme values rather than hardcoded colors. Font: Plus Jakarta Sans (self-hosted via `@fontsource-variable`).

Sample or illustrative content is kept in `src/constants/landingContent.js` (`DEMO_*`) and must be labelled with `DemoBadge` in the UI.

## Status

- Public pages, design system, auth pages: built.
- Backend: **Django + SQLite, migrated from Supabase.** Accounts, profiles, the planner tables and reminders, with the rules the earlier Postgres triggers and Row Level Security enforced now in Python. The Supabase code, dependencies, PGlite tests and scripts are removed; the retired SQL is kept for reference in `docs/archive/supabase/`. See [docs/DJANGO_MIGRATION.md](docs/DJANGO_MIGRATION.md) for what moved, what was removed and where its coverage went.
- Signed-in screens: My Day, Week, Progress, Recurring Tasks, Reminders, Settings (with account deletion). Verified in the browser against the real server on Chromium (see the evidence table in the migration doc).
- Not yet: deployment, an email provider, email confirmation, groups, challenge membership, onboarding. Challenge data is sample data.

See [docs/](docs/): `DAILY_PLANNING_SPEC.md`, `DJANGO_MIGRATION.md`, `DEPLOYMENT.md`, `AUTH_SECURITY.md`, `SECURITY.md`, `BACKUP_RESTORE.md`, `EMAIL_DECISIONS.md`, `REMINDERS.md`, `PRIVACY_POLICY_PROPOSAL.md`, `PROJECT_STRUCTURE.md`, `FEATURE_TRACKER.md`, `DEVELOPMENT_LOG.md`, `KNOWN_ISSUES.md`.
