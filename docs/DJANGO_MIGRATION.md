# Backend migration: Supabase to Django + SQLite

Status: **complete in code; not deployed.** Django + SQLite is the only backend. The Supabase code, dependencies, PGlite tests and verification scripts have been removed (details below). The retired SQL is kept for reference in `docs/archive/supabase/`.

## How it was done

The frontend was built against a Supabase-shaped client (`from(table).select()...`, with Row Level Security as the only authorisation boundary), and the planner and reminder services hold all the product rules. Rewriting them for a new API would have thrown away heavily tested logic, so the migration kept the services and replaced what is under them:

1. A **shared API client** (`src/services/api/apiClient.js`) owns the API address, the bearer token and the error shape.
2. A **data client** (`src/services/api/djangoClient.js`) keeps the `from(table).select()...` shape the services use and turns each query into one request to the API, mapping API error codes onto the codes the services already understand.
3. A **Django API** (`backend/`) implements the tables, the ownership rules and every rule the Postgres triggers and RLS enforced.
4. `src/services/backend.js` creates the data client once; `authService.js` and `profileService.js` use the API.
5. The Playwright stub and the integration tests were re-pointed at the API (a stub of it, and the real server).
6. Only then were the Supabase client, `supabase/`, the PGlite tests, the verification scripts and the two dependencies removed.

## What the Django backend is

| Piece | Where | Notes |
| --- | --- | --- |
| Users | `django.contrib.auth` | Email is the username (case-insensitive uniqueness). |
| Profile | `accounts.Profile` | One per user, created by a signal; timezone validated against the IANA list; visibility private by default. |
| Sign-in | `accounts.AuthToken`, `BearerTokenAuthentication` | Opaque random bearer token, stored hashed, expiring, revoked on logout / password change / reset / deletion. No cookies. |
| Account deletion | `accounts.views.AccountDeleteView` | Password + typed `DELETE`; one transaction; staff refused. |
| Planner | `planner.models`, `rules.py`, `resources.py` | Same columns as the Postgres tables; the trigger and RLS rules are explicit Python. |
| Reminders | `reminders.models`, `resources.py` | Same columns; the trigger behaviour is explicit. |
| Collections | `config/resources.py` | One generic view per table: filter (`col`, `col__neq/lt/lte/gt/gte/in/isnull`), order, page; create (one or a list, atomic); update and delete need a filter. Always scoped to the caller. Server-maintained columns are refused, not ignored. |
| Errors | `config/errors.py` | `{"error": {"code", "message", "fields"?}}` everywhere. |

Rules ported from Postgres and tested: owner-only access; the 7-date editing window and the 366-day bound; baseline fixed once (first progress, set-aside, Busy or Rest); `in_original_plan` set on create; completion 0 / 0.5 / 1 with server-stamped times; no progress for a future date; set-aside needs a reason, a done task cannot be set aside; hard delete only for untouched tasks and never an original-plan task after the baseline; one occurrence per template per day; template delete keeps history and cleans suppression lists; the abuse caps; reminder rules. Full table: `docs/SECURITY.md`.

### Differences from the Supabase design

- **Ids:** planner rows keep UUIDs; users and profiles use Django's integer ids.
- **Email confirmation:** none. **Registering signs the user in immediately**: this is the intended behaviour. The project specification (`docs/DAILY_PLANNING_SPEC.md`) says nothing requiring confirmation, so the existing behaviour was kept and recorded here as a decision to revisit before launch (the cost: anyone can register any address, and a typo in the address cannot be caught). If confirmation is wanted later it needs an `is_active`/verified step, a confirmation email and a login rule: not built.
- **Password reset** uses Django's signed single-use token in a link to `/update-password?uid=&token=`. It works in any browser (the Supabase PKCE link only worked where it was requested).
- **Email delivery** is configured through environment variables only: debug prints to the console, tests write files, production uses SMTP from `DJANGO_EMAIL_*`. No credential is in the repository, none is ever printed, and **no real email has been sent**.
- **Transactions:** multi-step planner operations are still several requests (as with PostgREST); a batch insert is atomic.
- **SQLite** is single-writer. WAL mode and immediate transactions make simultaneous requests queue instead of failing (found and fixed in the browser run: a double day-creation returned `database is locked`).

## Evidence (17-18 October 2026)

| Check | Command | Result |
| --- | --- | --- |
| Backend (sign-in, tokens, profile, planner rules, reminders, isolation, errors, deletion, test clock) | `npm run test:backend` | 63 passed |
| Frontend unit tests, no server | `npx vitest run --project unit` | 665 passed (37 files) |
| Real screens and services against a real server | `npx vitest run --project integration` | 97 passed (9 files), 3 clean repeated runs |
| Real browser, stubbed API (UI behaviour, states, pinned clock) | `npm run test:e2e` | 74 passed (37 specs x desktop and mobile) |
| Real browser, **real Django + SQLite**, real CORS | `npm run test:e2e:django` | 30 passed (15 specs x desktop and mobile) |
| 23-step journey through the real services and a real server | `npm run verify:django` | 23 of 23 |
| Lint, production build | `npx eslint .`, `npm run build` | clean; the bundle contains no Supabase code and no `VITE_` variable name |
| Django deployment check, production-style settings | `python manage.py check --deploy` | only two optional HSTS-extras notices (include-subdomains, preload) |

Browser runs cover: registration with immediate sign-in, session surviving a reload, duplicate and weak-password refusals, logout, protected routes, a token revoked behind the app's back, CORS for the app's origin and a hostile one, password reset by emailed link in a second browser profile (single use, old password rejected), a signed-in password change, a full planner journey (add, complete, reload, Week, Progress), repeating tasks (create, list, end), settings and reminders persistence, one user unable to read, change or delete another's data by id, and account deletion. All on Chromium only; Firefox and WebKit were not run.

### Bugs the migration work found (all fixed)

- `database is locked` on simultaneous writes (SQLite): immediate transactions + WAL.
- A day-plan change that finished after the person navigated to another day replaced that day's data, leaving the new day on a loading skeleton forever (`useDayPlan`; regression test added).
- A wrong current password was reported as "Email or password is incorrect."
- The bundle inlined the whole `import.meta.env` object (every `VITE_` variable in `.env`); now read by static name, with a guard test.
- Page subtitles rendered as `<h6>` (earlier release pass), and an offline page load showed a developer error screen.

## Removed with Supabase

All of this is in Git history before the commit that deletes it.

| Removed | Why / what covers it now |
| --- | --- |
| `src/services/supabaseClient.js`, the `@supabase/supabase-js` and `@electric-sql/pglite` dependencies, `scripts/verify-supabase.mjs`, `scripts/lib/verificationGuards.js`, `scripts/set-test-env.ps1`, `tests/unit/supabaseClient.test.js`, `tests/unit/verificationGuards.test.js`, `supabase/verification/schema_checks.sql` | Nothing uses a hosted Supabase project; the tooling existed only to verify it. `npm run verify:django` is the equivalent journey. |
| `supabase/migrations/*.sql`, `docs/SUPABASE_SETUP.md` | **Archived** in `docs/archive/supabase/` as the reference the Django models were ported from. |
| `tests/db/planner.rls`, `planner.schema`, `migrations.hygiene`, `profiles.rls`, `schemaChecks`, `serviceJourney.pglite` | Postgres-specific (policies, grants, SQL constraints, migration text). Their rules are tested by `backend/tests` (isolation, window, constraints, caps, baselines, deletion protections) and `verify:django`. |
| `tests/db/planner.timezones` (JS timezone helpers vs PostgreSQL, 8 zones) | The helpers are still unit-tested with real DST dates; the PostgreSQL cross-check is gone. The server uses Python's `zoneinfo` for "today" and the window: **this JS-vs-Python agreement is not cross-checked** (only exercised by the Auckland/New York cases in the Week integration test and the backend window tests). |
| `tests/db/plannerService.integration` (42), `plannerSystem.integration` (21, incl. the randomised run against independent oracles), `reminders.integration` | Heavily DB-centric (arranging old history as the database owner, injecting competing writes between statements, asserting Postgres error text). **Not ported.** Service behaviour is still covered by the mocked service tests, the ported screen-level integration tests, the backend suite and the 23-step journey; **the randomised system run and the "competing tab" race tests no longer exist.** Porting them (seeding history by pinning the test clock earlier, then advancing it) is remaining work. |
| The eight screen-level PGlite tests | **Ported, not removed**: My Day, Recurring Tasks, Progress, Reminder UI, Settings, Welcome-back, Week projection and the core journey now run in `tests/integration` against the real server. |

## Remaining work

1. **Deployment** (not started, nothing deployed): choose hosting, a production WSGI/ASGI server, HTTPS, an SMTP provider; follow `docs/DEPLOYMENT.md`, including its blocker list (CSP, HSTS decision, email provider, backups tested, privacy policy).
2. **Email confirmation**, if wanted before launch (see above).
3. **Port the removed service-level coverage** (`plannerService`, `plannerSystem`, `reminders`) to the real-server harness.
4. **Cross-browser runs** (Firefox, WebKit) and a physical phone.
5. The stubbed Playwright suite duplicates what the real-server suite could prove; it is kept for fast UI-state coverage (error, empty, slow, pinned clock). Reduce it if maintenance cost grows.
6. The admin (`/admin/`) is enabled and unstyled without `collectstatic`.
