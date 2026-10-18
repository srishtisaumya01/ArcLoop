# Feature tracker

Legend: **Verified** = covered by automated checks that ran, at the level stated. **Built** = implemented and tested, but not at the level that would prove it end to end (stated in Notes). **Not started.** "Real server" means the Django API with a real SQLite file; "stub" means the in-memory stand-in for the API used by the fast Playwright suite. Nothing is deployed; no real email has been sent; only Chromium has been run.

Test names: backend = `npm run test:backend` (63), unit = `vitest --project unit` (665), integration = `vitest --project integration` (97, real server), e2e = `npm run test:e2e` (74, stub), e2e-django = `npm run test:e2e:django` (30, real server and browser), journey = `npm run verify:django` (23 steps, real server).

| Area | Feature | Status | Evidence and notes |
| --- | --- | --- | --- |
| Foundation | Vite + React, router, MUI theme, lint, tests | Verified | Lint clean, build clean (bundle has no Supabase code and no `VITE_` names) |
| Design system | Tokens, MUI theme, logo, shared layout | Done | |
| Public | Landing page | Done | Sample content labelled |
| Public | Explore challenges, Challenge details | Done (demo data) | Real data and join/leave are Phase 5 |
| Public | Privacy / Terms | Draft | Not legally reviewed; do not yet describe backups or deletion |
| Public | Contact / support | UI only | Form does not send |
| Public | Route-level code splitting; a page that cannot load shows "This page didn't load" with retry | Verified | e2e (`release-checks`), offline load case |
| Backend | Django + SQLite API (`backend/`): accounts, profile, planner tables, reminders; one user-scoped collection view per table; one error shape | Verified | backend (63), integration, e2e-django, journey. Migration record: `docs/DJANGO_MIGRATION.md` |
| Auth | Register (signs in immediately; no email confirmation), login, logout (this device), session restore, route guards | Verified | backend (15 auth and profile tests), e2e-django (registration, reload, duplicate, weak password, logout, protected routes, revoked token) |
| Auth | Password reset by emailed single-use link (any browser), signed-in password change with the current password | Verified | backend, e2e-django (reset in a second browser profile; link single use; old password rejected). **Email delivery itself never exercised**: dev prints to the console, tests write files; SMTP is configured only through environment variables |
| Auth | Account deletion (Settings): password + typed `DELETE`, deletes the account and everything it owns, all sessions end, staff refused, repeat request refused | Verified | backend (7 tests incl. other users untouched and re-registration), unit (dialog gating), e2e-django (full flow, wrong password keeps the account), e2e (dialog offered). Backups still hold the data until they expire |
| Auth | CORS: the app's origin allowed, others not advertised, no credentials | Verified | e2e-django (real cross-origin requests) |
| Auth | Rate limiting on public auth endpoints | Verified | backend. Per client address; no account lockout |
| Auth | Signed-in `/app` home | Minimal placeholder | |
| Planner | Tasks: add, edit, complete, uncomplete, delete; times, estimate, category, priority, recurrence (once / daily / weekdays) | Verified | unit (pure logic), integration, e2e |
| Planner | Progress engine: equal-weight units (0 / 0.5 / 1), zero-task handling, original vs revised plan, immutable snapshots; remaining effort and "what fits" | Verified | unit (pure logic) |
| Planner | Day modes (Normal, Busy, Rest), set aside / restore, reschedule with history; guided set-aside in My Day | Verified | unit, integration (My Day), e2e |
| Planner | Timezone handling (profile timezone, local dates, DST) | Built | unit with real DST dates; integration (Auckland vs New York); server uses Python `zoneinfo`. **JS-vs-server agreement is not cross-checked beyond those cases** (the old PostgreSQL cross-check was removed) |
| Planner | Server-enforced rules: owner-only, 7-date window, baseline, `in_original_plan`, server timestamps, no future progress, delete protections, caps | Verified | backend (planner rules, isolation), e2e-django (isolation by id), journey (steps 16-22) |
| Planner | Services layer (`src/services/planner/`) with the error model | Verified | unit (mocked service tests), integration, journey. **Removed:** the Postgres-era service integration tests and the randomised system run (see `docs/DJANGO_MIGRATION.md`) |
| Planner | My Day (`/app/day?date=`): checklist, progress with its method, preview of repeating tasks "Start this day" will add, add one-off / repeating tasks, edit for the day, remove, stop repeating, move to another day with undo, day type, past/future/read-only, loading/empty/error | Verified | integration (31 My Day tests), e2e, e2e-django (add, complete, reload). A completion finishing after navigation no longer strands the new day on a skeleton (`useDayPlan`, regression test) |
| Planner | Weekly Overview (`/app/week`): Monday-Sunday navigation, day cards, weekly summary ("Coming up" includes repeating tasks on unopened days) | Verified | unit, integration (Week projection, 6), e2e, e2e-django |
| Planner | Recurring Tasks (`/app/recurring`): list by status, edit incl. dates, end with confirmation, delete a task that has not started | Verified | integration, e2e, e2e-django (create, list, end, reload). No pause/resume (no paused state exists); an ended task cannot be restarted |
| Planner | Progress page (`/app/progress`): last 8 weeks and each repeating task over 28 days; no streaks | Verified | integration, e2e, e2e-django |
| Planner | Missed-day recovery notes ("Welcome back.", "Every week is a fresh opportunity.") with the approved wording | Verified | unit, integration (welcome-back), e2e |
| Planner | Reminders: settings, per-task reminder, in-app notice, optional browser notification, upcoming list | Built | integration (Reminder UI), backend, e2e, e2e-django (settings persist). **Delivery only while the app is open in a tab; no push, service worker or server scheduler; real browser notifications not exercised (headless Chromium reports permission denied)** |
| Planner | Core journey: sign in, plan and edit a day, complete, move, set aside, review Week and Progress, rename a repeating task, return after an untouched day | Verified | integration (core journey through the real routes and pages) |
| App | Settings (`/app/settings`): profile, privacy, reminders summary, account email, change password, delete account, timezone prompt | Verified | integration (15), e2e, e2e-django. Interests stored, not editable; visibility saved but nothing is shared yet |
| App | Accessibility basics: headings, labels, focus rings, reduced motion, no horizontal overflow at 390 / 768 / 1440 on every page | Verified | Release pass (Chromium, stub); e2e heading-structure checks |
| Planner | Challenge / community integration | Not started | Spec section 9; deliberately later |
| App | Real challenge membership, progress, leaderboard; groups and invitations | Not started | Phase 5 |
| Quality | Playwright with the stub (`e2e/`) | Verified | 37 specs x desktop and mobile: sign-in, My Day, Week, Progress, Recurring, Reminders, Settings, error/empty/slow states, navigation |
| Quality | Playwright with the real server (`e2e-django/`) | Verified | 15 specs x desktop and mobile; fresh SQLite file per run |
| Operations | Deployment preparation: environment variables, secrets, HTTPS, CORS, SQLite limits, backup and restore | Documented, **not deployed** | `docs/DEPLOYMENT.md`, with its blocker list (CSP, HSTS decision, SMTP provider, tested restore, privacy policy, no monitoring) |
| Backend | Email confirmation at sign-up | Not started | Decision recorded: registering signs in immediately |
| Backend | Supabase | **Removed** | Archived SQL in `docs/archive/supabase/` |
