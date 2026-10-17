# Development log

## Phase 1: Foundation
Vite + React JavaScript project, React Router, MUI theme foundation, ESLint, Vitest. Lint, tests and build passed.

## Phase 2: Design system and landing page
- Reference site (razorpay.com/rize) was inspected via its raw HTML only (no rendered view): navy/blue palette, TASA Orbiter + Lato fonts, pill buttons. Used as loose inspiration, nothing copied.
- Tokens in `src/theme/tokens.js`, MUI theme in `src/theme/theme.js`, Plus Jakarta Sans via `@fontsource-variable`, original loop logo.
- Landing page with labelled sample content. Verified in Chromium at 1440 / 820 / 390 px.

## Phase 2B: Remaining public page layouts
Built: Explore challenges, Challenge details, Login, Signup, Password reset, Privacy (draft), Terms (draft), Contact.

Decisions:
- Challenge data sits behind `services/challengeService.js` (async, short artificial delay) so loading/error/retry states are real code paths and Phase 5 only swaps the implementation.
- Winter Arc 90 is a data record (`featured: true`), not logic. `FeaturedChallengeCard` renders any featured challenge. The landing page now reads the same record.
- Auth/contact forms use `useForm` (validation, focus first invalid field) and `usePrototypeSubmit` (simulated pending state, ignores duplicate submits). After a valid submit they show an honest "not connected / nothing was saved" message instead of a fake success.
- Legal and contact placeholders come from `siteConfig.js`; empty values render a visible "[... to be configured]" marker.
- Route-level code splitting via React Router `lazy`. Main bundle went from ~530 kB to ~294 kB (see below).
- Static `Alert` notices were `role="alert"` by MUI default; changed theme default to `role="note"` so they are not announced as urgent errors.

Issues found and fixed during verification:
- Test DOM was leaking between tests (Vitest globals off, no auto-cleanup): added `cleanup` to `tests/setup.js`.
- Not-found/error panels on the details page had no `h1`: `StatePanel` now takes `headingLevel`.
- Footer and "On this page" links were 19-21 px tall: enlarged hit areas.
- Contact page duplicated its placeholder label ("Support email: [Support email: ...]"): fixed.
- `#join` anchor from challenge cards could not scroll before the challenge had loaded: details page scrolls after load.

### Checks run (Phase 2B)
- `npm run lint`: pass.
- `npm test`: 4 files, 40 tests, all pass.
- `npm run build`: pass, no chunk-size warning.
- Browser (Playwright/Chromium, dev server): all 12 routes at 1440 / 820 / 390 px, zero horizontal overflow, zero console errors or warnings, one h1 per page. Interaction checks: search, category filter, details navigation and back, card Join scrolls to join panel, login validation + focus + loading + result, signup preview, mobile menu navigation, FAQ expand, Tab order with visible focus on links and buttons.
- Screenshots were viewed for Explore (desktop, mobile), Details (desktop), Login errors, Signup preview, Privacy (desktop), Contact (mobile), Home (tablet).

### Bundle size
| | Phase 2 | Phase 2B |
| --- | --- | --- |
| Entry JS | 530 kB (gzip 167 kB), size warning | 294 kB (gzip 91 kB), no warning |
| Largest other chunk | n/a | 219 kB (gzip 74 kB), shared MUI code |

Splitting is by route only; no custom chunking configuration was added.

## Phase 3: Authentication, database foundation and security

Scope note: the Phase 3 prompt was truncated partway through "Step 4 - Session and route protection". Work covered the visible steps plus the title's "database foundation & security": Supabase client, real auth flows, session/route protection, a `profiles` migration with RLS, and security tests/docs. Onboarding, profile editing, account deletion and all habit/challenge/group tables were left out of scope.

Assessment before starting: Phase 2B was complete (9 routes, lazy loading, 40 passing tests). No Supabase dependency, client, migrations or `.env` existed. No credentials, Docker, psql or Supabase CLI were available, so nothing could be verified against a real project.

### Built
- `src/services/supabaseClient.js`: single client, PKCE flow, reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; unset, malformed, or `.env.example` placeholder values count as "not configured" (client is `null`, no fake connection).
- `src/services/authService.js`: sign up, log in, log out (this device), reset request, update password, session read, auth-change subscription. Errors mapped to friendly messages by code; raw provider text never shown.
- `src/context/AuthProvider.jsx` + `useAuth`: restores the session on load, listens for sign-in/out/refresh, unsubscribes on unmount. States: loading / authenticated / unauthenticated / unconfigured.
- `RequireAuth` / `GuestOnly` route guards (return-to-origin after login). `/app` protected; `/login`, `/signup`, `/forgot-password` guest-only; `/update-password` handles its own states (valid link / expired link).
- Auth pages now call the service; `useAsyncSubmit` prevents duplicate submits and keeps the server error. Prototype auth code removed; `usePrototypeSubmit` remains for the contact form only.
- Migration `supabase/migrations/20261017000000_create_profiles.sql` (see docs/SECURITY.md).
- Minimal `/app` page reading the caller's own profile through RLS.
- Copy that would have become false was updated (hero note depends on configuration; FAQ; privacy draft status paragraph).

### Checks actually run
- `npm run lint`: pass.
- `npm test`: 9 files, 95 tests, all pass.
  - `tests/db` (19): migration + RLS in PGlite with stand-in Supabase roles. Covers auto-created private profile, own-row read/update, other users' rows invisible/untouchable (even if "public"), anon denied, no client INSERT/DELETE, `id`/`created_at`/`updated_at` not writable, constraint violations, trigger functions not callable, cascade on user deletion.
  - `authFlows` (17, services mocked): success/failure/duplicate-submit/validation for login, signup, reset request, update password; return-to-origin; session restore; loader while restoring; sign-out and expiry events; unsubscribe on unmount; logout; profile retry.
  - `authService` (8), `supabaseClient` (4), `security` (5, mutation-checked: planting a service-role reference in `src/` made it fail), plus the existing routing/challenge/form suites.
- `npm run build`: pass, no chunk-size warning. Entry JS 299 kB (93 kB gzip).
- Browser, unconfigured (Chromium, 1280 and 390 px): all auth routes render with one h1, no overflow, no console errors; submit buttons disabled; `/app` redirects to `/login`.
- Browser, configured against a **local mock of the Supabase endpoints** (not real Supabase) using the real `supabase-js` client: 25/25 scripted checks passed. They cover redirect of guests, wrong credentials, signup neutral message, unconfirmed login, login to `/app` with profile loaded, session persisted and restored on reload, guest-only redirect, logout, protected again, reset request, PKCE reset link -> new password form -> mismatch blocked -> update -> old password rejected -> new password works, network failure message, expired link, mobile overflow and menu, no unexpected console errors.
- Screenshots viewed: unconfigured login, signed-in `/app`, signed-in mobile menu.

### Not done / not verified
- Nothing was run against a real Supabase project. Real behaviour of email confirmation, redirect allow-listing, rate limits, default grants and PostgREST must be checked using docs/SUPABASE_SETUP.md.
- Playwright scripts used for verification live outside the repo; no e2e specs are committed.

## Product update: Daily Planning & Progress Engine (requirements and architecture only)

**No application code, migration, dependency or test was changed.** This task aligned the product specification, tracker and data model with a new core feature, and recorded the plan. Nothing described below is implemented.

Core principle recorded throughout: *A missed day is an event, not an identity. Progress should help people return, not make them feel guilty.*

### Repository assessment (before editing)
- Phase 1, 2, 2B and 3 code present; no planner code. The only database table is `profiles` (has `timezone` and `progress_visibility`, which the planner reuses).
- Existing docs: README, PROJECT_STRUCTURE, FEATURE_TRACKER, DEVELOPMENT_LOG, KNOWN_ISSUES, SECURITY, SUPABASE_SETUP.
- Conflicts found: the earlier `habits` / `habit_checkins` plan is superseded; landing copy says "Streaks without shame" and the sample preview shows a flame icon with "4 of 7 days" (flagged, not changed); Phase 3 remains unverified against a real Supabase project.
- Git: repository initialised on `master`, no commits, everything untracked (unchanged).

### Decisions made in the spec (for owner review)
- Model: **task template** (reusable definition) vs **day plan** (one per local date: mode, baseline) vs **task occurrence** (date-specific, self-contained snapshot holding completion and plan state). Completion lives on the occurrence: one source of truth, no separate check-ins table; progress is computed, never stored.
- Duplicate prevention: partial unique index on (template_id, plan_date).
- Original vs revised plan: a baseline timestamp is stamped at the first completion or revision; `in_original_plan` is set by trigger; both figures are computed from the same rows.
- Progress: equal weight, units 0 / 0.5 / 1, zero active tasks gives `null` (never NaN/0%), 100% only when all units are complete, unopened days are "no record" not 0.
- Timezone: `plan_date` is a local date never converted; "today" uses the profile timezone; wall-clock times without zones; DST affects only `completed_at` and "time left today".
- Privacy: owner-only RLS, no cross-user policies, aggregates-only sharing later, never titles or descriptions.
- 12 open decisions (D1-D12) listed with recommendations.

### Files
- **Created:** `docs/DAILY_PLANNING_SPEC.md`
- **Modified:** `README.md`, `docs/FEATURE_TRACKER.md`, `docs/KNOWN_ISSUES.md`, `docs/PROJECT_STRUCTURE.md`, `docs/DEVELOPMENT_LOG.md` (this entry; earlier content kept)
- **Deleted / moved:** none. `docs/SECURITY.md` and `docs/SUPABASE_SETUP.md` were not changed (planner security is in spec section 8; fold into SECURITY.md when tables exist).

### Commands run
Inspection only (`git status`, `git log`, `ls`, `grep` over `src/` for planner and shame-adjacent wording, reading the existing docs). Afterwards, only to confirm the baseline was unaffected by the documentation changes: `npm run lint` passed, `npm test` passed (9 files, 95 tests), `npm run build` succeeded. No code changed, so these say nothing about the planner, which does not exist yet.

## Decision review (D1-D12), before implementing planner logic
Docs only; no code, migration, test or dependency changes were made, and no commit was created.
- Added section 11a "Decision status" to `docs/DAILY_PLANNING_SPEC.md`: D1, D4, D5 and D9 recorded as **provisional** owner directions (not approved), D5 changed from the recommended 14 days to 7 with its implications documented, the other eight left unresolved.
- Implementation of the pure planner logic is **on hold until the owner approves the decisions**.

## Planner logic: pre-implementation consistency check (STOPPED before coding)
Docs only; no code, migration, test or dependency changes; no commit.
- Owner approved all twelve decisions (D5 as 7 dates total: today plus the previous 6).
- Cross-checking the approved decisions against spec sections 5, 6.3 and 6.4 found two lifecycle contradictions that change the rules the pure logic must enforce, so implementation was **stopped** as instructed (spec section 11b):
  - **C1** lazy occurrence creation can resurrect deleted tasks; 6.3 and 6.4 also disagree on whether a removal stamps the baseline.
  - **C2** a partially completed task cannot be set aside or rescheduled under the proposed `completion = 0` constraint.
- Working definitions for gaps (progress day, rest day, average, weekly threshold, horizon, DST resolution) are recorded in 11b. DST resolution rules were checked against PostgreSQL via PGlite (scratch script, not committed).
- Spec 11a updated: all twelve decisions now **Approved**; the D5 definition corrected from 8 dates to 7.

## Pure planner logic (src/utils/planner/): implemented
No UI, authentication, Supabase migration or RLS change. No dependency added or changed (PGlite, already a dev dependency, is used for the timezone cross-check). No commit created, nothing staged by this work.

### Rulings applied
- **C1 = option C** (hard delete plus a per-day suppression list) and **C2 = option B** (a partially completed task may be set aside or moved; a done task may not), as recorded in spec 11b. Option C needed one interpretation: a pre-baseline delete is plan composition and does not fix the baseline. Flagged for confirmation (spec 14.4).
- Approved working definitions from the brief were implemented as written: Monday-Sunday weeks, a day with progress has active units > 0 (rest-day progress counts), rest days excluded from averages, average = arithmetic mean over planned non-rest days, summary eligible at 3 days with a plan, 30-day plan-ahead limit as a configurable constant, partial task uses its full estimate, DST gap forward / overlap later.

### Built
17 modules in `src/utils/planner/` (about 1,200 lines) covering progress, recurrence, local dates and timezones, the 7-date editing window, rescheduling and undo, day modes, immutable plan snapshots, weekly metrics and workload. Documented in spec section 14.

### Verification actually run
- `npm run lint`: pass, no warnings.
- `npm test` (complete suite): **24 files, 394 tests, all pass** (was 9 files, 95 tests). New: 14 planner unit files with 282 tests, plus `tests/db/planner.timezones.test.js` with 17. Suite time about 70 s; the timezone cross-check alone is about 40 s.
- `npm run build`: pass. Entry bundle unchanged (299.09 kB, same hash); the planner is not imported by the app yet, so none of it ships.
- **JS vs PostgreSQL (PGlite):** 8 zones x 365 days x 10 wall-clock times for instant conversion, half-hourly instants across 2026 for local date, and 26 timezone names. All agree. Scope: those zones and 2026 only; Node ICU tz data 2026c against the PGlite build's tz data; not a hosted Supabase instance.
- **Mutation check:** 11 deliberate rule breaks (window off-by-one, percent cap, partial counted as 1, eligibility off-by-one, rest days in average, pre-baseline delete stamping, suppression ignored, late task joining original plan, C2 reverted, DST gap backward, workload partial halved): 11 of 11 caught by the planner tests. All files restored afterwards.
- **Host timezone independence:** the planner suite passed with the host timezone set to Asia/Kolkata (this machine's default), UTC, America/New_York, Pacific/Auckland and Asia/Tokyo (each verified by reading Node's reported offset; an earlier attempt that used names Node on Windows ignores was discarded as invalid).
- Failures found and fixed during the work, all in my own tests: a strict-identity assertion on a copied object; a purity regex that mistook the `./window.js` import path for the DOM `window`; a miscounted scenario (4 open non-priority tasks, not 3).

### Not done / not verified
- Nothing in the app uses the planner yet; no persistence, no UI, no migration for the proposed planner tables.
- Items in spec 14.4 are provisional or interpreted and need product approval.

### Git state observation
At the end of the work, everything was found **staged** in the index (status `A`), although no `git add` was run by this work, and no commit exists. The staged copy of `src/utils/planner/timeZones.js` differs from the working copy: it holds the temporary "DST gap resolves backward" line from the mutation check (`wall - after * 1000`), captured while that file was briefly modified. The working copy is correct and is what all test results above refer to. The index was left untouched. To fix the index, either `git reset` (unstage everything, keeping all files) or `git add src/utils/planner/timeZones.js` (refresh that one file) before any commit.

## First commit and push
On the owner's explicit request (GitHub quick-start commands), the project was committed and pushed.
- Deviations from the pasted commands, deliberately: the `echo "# ArcLoop" >> README.md` line was skipped (it would have appended a duplicate heading to an existing README), and the index was refreshed with `git add -A` first so the commit matched the tested working tree. This replaced the stale staged copy of `src/utils/planner/timeZones.js` described above. `git add README.md` alone would have committed the stale copy.
- Checked before committing: git identity already set to srishtisaumya01; no secret-shaped strings in the 127 files; `node_modules`, `dist` and any `.env` excluded.
- Result: commit `8518149` "first commit" (127 files) on `main`, pushed to https://github.com/srishtisaumya01/ArcLoop.git; the remote head matches the local commit. The documentation updates made after this commit are uncommitted.

## Planner database migration + RLS tests
No UI, React component, onboarding, authentication or dependency change. No commit or push made. The existing migration `20261017000000_create_profiles.sql` is unchanged (confirmed with `git diff`).

### Inspection
Branch `srishti` (tracking `origin/srishti`), working tree clean at the start; the planner logic was already committed (17 tracked files). The only existing migration was `create_profiles`; no planner tables existed, so there was no existing constraint to relax: the final form of the completion constraint was created directly. The database test harness is PGlite (Postgres 18.6); no Docker, `psql` or Supabase CLI is available, so nothing could run on a real or local Supabase instance.

### Design and consistency check
Designed against spec sections 6, 8, 11a, 11b and 14 before writing SQL. No conflict with the approved specification or the C1 / C2 rulings. Additions beyond the sketch (listed in spec 15.5): composite `(user_id, ...)` keys, server-set timestamps and baseline, DB-side 7-date window and future-progress rule, provisional caps, a 366-day sanity bound, column-level grants, and no server functions (deferred).

### Built
`supabase/migrations/20261017100000_create_planner.sql` (forward-only, additive; PostgreSQL 15+): three tables, seven helper functions, six trigger functions (two of them `SECURITY DEFINER`), 11 RLS policies, column-level grants, all constraints and indexes. Spec section 15 records it.

### Defects found by the tests and fixed in the migration
1. A `once` template with no `ends_on` passed its CHECK (`NULL = date` is not false): now `IS NOT DISTINCT FROM`.
2. `completion numeric(2,1)` would have rounded 0.45 to 0.5 and 0.95 to 1.0 before the check ran: now plain `numeric`.
3. Negative completion got a `completed_at`, and an unknown `plan_state` got an `excluded_at`, so the right constraint did not report: both triggers now set those fields only for valid states.
4. The baseline could never be stamped: the `day_plans` guard overwrote it on every update, cancelling the legitimate stamp. Now a set baseline is immutable but a missing one can be filled in by server code.
Three further failures were mistakes in my tests (a schema-prefix filter, a stale row filter, and an over-broad regex).

### Verification actually run
- Database tests, all in PGlite (not real Supabase): `planner.schema` 49, `planner.rls` 37, `migrations.hygiene` 7, plus the existing `profiles.rls` 19 and `planner.timezones` 17: all pass.
- **Mutation check on the migration:** 14 deliberate weakenings (read policy open, insert policy open, window removed, grant on `in_original_plan`, delete of progress, delete of original-plan rows, cross-user template key, cascade on template delete, extra completion value, anon grant, suppression check off, timezone ignored, future progress allowed, baseline never stamped): 14 of 14 caught. The file was restored byte-for-byte (`cmp`).
- `npm run lint`: pass. `npm test` (complete suite): **27 files, 487 tests, all pass** (was 24 files, 394). Existing planner unit tests unchanged and passing. `npm run build`: pass, bundle unchanged (299.09 kB).

### Not verified
Anything on a real Supabase project (see spec 15.4 and KNOWN_ISSUES). The migration was **not applied to any database** other than throwaway in-memory PGlite instances created by the tests.

## Planner services layer (src/services/planner/)
No React component, hook, page, onboarding, authentication, migration or RLS change (verified: no change under `src/components`, `pages`, `hooks`, `context`, `app`, `theme`, `utils`, `constants`; the planner migration is identical to what was staged before this phase). No dependency added. No commit or push made.

### Inspection and blocker check
Branch `srishti`, no commits since the previous phase (a `COMMIT_EDITMSG` template was open in the IDE; it was empty, nothing was committed). The planner migration had been applied and verified only in PGlite (93 tests plus a 14-case mutation check, no unresolved RLS failures). That is the only test database available (no Docker, `psql` or Supabase CLI), so it was treated as not blocking, with the limitation stated everywhere: it is not a real Supabase project. Every requested operation was checked against the actual schema and column grants; none needed a migration.

### Built
`src/services/planner/` (about 750 lines): `createPlannerService` (factory with an injectable client and clock; 21 operations), `errors` (`PlannerServiceError`, 8 codes, database wording never shown), `mappers` (rows to domain, writable-column lists), `index` (wired to the shared client). Documented in spec section 16.

### Test support added
`tests/support/`: `queryBuilder` (supabase-js-shaped builder), `fakeClient` and `memoryDb` (MOCKS), and `pgliteSupabase` (an adapter that runs the service's queries as SQL in PGlite under the `authenticated` / `anon` roles, so the real migration's RLS, grants, triggers and constraints apply). The adapter is not PostgREST and not Supabase.

### Verification actually run
- `npm run lint`: pass.
- `npm test` (complete suite): **32 files, 710 tests, all pass** (was 27 files, 487). New: `errors` and `mappers` 44, `service.mocked` 130, `hygiene` 7 (static), `plannerService.integration` 42 (PGlite). Time about 107 s.
- `npm run build`: pass; bundle unchanged (299.09 kB, same hash) because nothing imports the services yet.
- **Mutation check on the service:** 15 deliberate breakages (backfill allowed, forbidden column sent, zero-row update treated as success, suppression not restored, user-id filtering added, no duplicate retry, no clean-up after a failed reschedule, permission error mislabelled, silent truncation, no-op completion still written, timezone ignored, delete removing progress, archiving an unstarted template, archived templates listed, validation skipped): 15 of 15 caught. Sources restored byte-for-byte (`cmp`).

### What the tests found
No defect in the service itself. Every initial failure was a mistake in test code or fixtures: the fake client mistook an empty answer for a missing profile; a wrong boundary expectation (03-05 is still editable on 03-11) that also left the test clock moved, fixed with an `afterEach` reset; expectations that forgot a daily template recreates a second task, that deleting a template clears `templateId` on history (by design), and that a `BEFORE` trigger (future-date progress) runs before a CHECK; and a lint error for a useless assignment.

### Not verified
Anything on a real Supabase project or PostgREST (spec 16.8, KNOWN_ISSUES). Multi-step operations are not transactional (spec 16.5).

## Integration and end-to-end verification (audit of the connected system)

### Audit finding that changes the plan
The brief assumed a My Day UI existed. **It does not.** There is no planner page, route, hook or component; `/app` is still the placeholder account page; nothing outside `src/services/planner` and `src/utils/planner` imports the planner. The docs already said so (tracker: "My Day: Spec only"). So no UI-to-database flow could be verified, and nothing in a browser was tested: UI loading states, forms and navigation cannot be exercised until the UI is built. Playwright and Chromium are installed, but there are no e2e specs and nothing to point them at. No UI was built (that would be a new feature).

### What was verified (as a connected system, in PGlite, not on a real Supabase project)
New `tests/db/plannerSystem.integration.test.js` (21 tests) runs the real pure logic, the real service and the real migration together and checks them against oracles written independently in the test file:
- Data written in one session is exactly what a brand-new session reads (refresh persistence); recurring templates produce exactly the right tasks on every date from the window start to the future (weekly, daily, once, not-yet-started, ended).
- "Today" and the 7-date window computed by the service agree with the database at 33 zone/instant pairs around local midnights, including daylight-saving edges and Havana's missing midnight; changing the profile timezone moves "today" and the window and rewrites no stored history.
- User switching and session expiry on one client leak nothing; two users with identical data never bleed into each other.
- Editing a task, and editing, archiving or deleting a template, never change recorded completion, timestamps, the original-plan flag or baselines; moving and undoing a move restores a task exactly.
- No error message, detail or serialised form contains SQL, table names, other users' ids or credentials.
- A seeded randomised run (3 seeds x 45 operations over 14 operation types, with deliberate edge probes) checks after every step: completion values, no duplicate occurrences, original-plan flags and baselines never change, progress never disappears or changes without an operation, read-only history never changes, another user's data never changes, and that the service's summaries and the weekly summary equal independent recomputations from raw rows. It also treats any database refusal, or a write that hits zero rows, as a disagreement between the logic and the database.

### Bug found and fixed
`PlannerServiceError.cause` was an enumerable property, so serialising an error (logging, telemetry, a UI dump) would have emitted the raw database error. It is now non-enumerable (still readable as `error.cause`). Zero-row and refused-delete failures also carry `details.reason` so a disagreement can be diagnosed. All other initial failures were mistakes in the new test file.

### Verification actually run
`npm run lint`: pass. `npm test`: **33 files, 731 tests, all pass**. `npm run build`: pass (bundle unchanged, 299.09 kB). `git diff --check`: clean. Mutation check: on the service layer 15 of 15 broken behaviours were caught; for the system-level file, 8 deliberate faults gave 5 caught on the first pass. Three were missed by the randomised run (reschedule to a read-only day, rest days in the weekly average, the 99% cap), and each of those IS caught by the planner unit tests (verified). The run was then strengthened with deterministic probes, but the re-check of those three against the system file was interrupted and **not completed**, so the stronger probes are unverified against those faults.

### Incident
An interrupted mutation run left one planted fault in `src/utils/planner/occurrences.js`. It was noticed because lint and four tests failed, confirmed to be exactly that one line, and restored from the committed version before anything was committed. No committed code contained it.

### Not verified
Real Supabase or PostgREST behaviour; any browser or UI flow (no UI); concurrency; onboarding (a new profile's timezone is UTC until it is set).

### Readiness
**Not ready for a manual acceptance test.** The logic, services and database are verified as a connected system in PGlite, but there is nothing for a person to use: the My Day screen and hooks still need to be built, and onboarding should come first so "today" is correct for a new user.


## Weekly Overview
Added `/app/week` (page, `useWeekOverview`, `src/components/planner/*`). `summarizeWeek` was extended (per-day task lists, remaining, upcoming workload, `isCurrentWeek`) so the UI does no recalculation. Hygiene test now allows only `hooks/useWeekOverview.js` to import the planner service entry point. New tests: `tests/unit/planner/weeklyOverview.test.js`, `tests/unit/weeklyOverviewPage.test.jsx`. Not committed.

My Day added at `/app/day` (`MyDayPage`, `useDayPlan`, `TaskRow`, `AddTaskForm`). Today and the editable past are opened through `openDay`; future days and read-only history are only read so browsing creates nothing. Tests: `tests/db/myDay.integration.test.js` (UI + hook + real service + PGlite). The hygiene test now allows `useDayPlan.js` and `useWeekOverview.js`. Not committed.

My Day task management: repeating tasks (createTemplate from the day), edit for one day (updateOccurrence), remove with confirmation (removeOccurrence, C1 rules), stop repeating (archiveTemplate). Shared fields in TaskFields/taskForm. 4 more integration tests in tests/db/myDay.integration.test.js. Not committed.

## Reminders
Migration `20261018000000_create_reminders.sql` (`reminder_preferences`, `task_reminders`), pure rules in `src/utils/planner/reminders.js`, `src/services/reminders/`, browser wrapper in `src/services/notifications/`, scheduler hook `useReminderScheduler` mounted lazily for signed-in users in `RequireAuth`, settings page `/app/reminders`, My Day "Remind me". Duplicate prevention: the database records delivery (`last_notified_on`, `notified_at`) with a conditional update, so only one tab/session claims each reminder. The test adapter's table whitelist and the schema test's table list were extended. Not committed.

## Profile and timezone
No migration: `profiles` already had `timezone`/`display_name`, own-row RLS, column grants and a timezone trigger. Extended `profileService` (partial `updateMyProfile`, `getMyTimezone`), added `utils/profile.js`, `/app/profile` and a lazy `TimezonePrompt` in `RequireAuth`. Planner views and the reminder scheduler refresh on a profile-changed event. Bug caught before shipping: an early version of the prompt sent a display name with the timezone and would have cleared an existing name; updates are now partial and a test pins it. Not committed.

## Moving tasks between days
My Day now uses the existing `rescheduleOccurrence` / `undoReschedule` service operations (Move form, Undo move). `readPlan` gained a read-only `moves` map (movedTo / movedFrom dates) built from the existing `rescheduled_from_id` link, so no schema change. 5 integration tests against the real service in PGlite, including week/My Day agreement and no duplicate for repeating tasks. Not committed.

## Settings
Replaced the standalone profile page with `/app/settings` (`SettingsPage` + `ProfileSection`, `PrivacySection`, shared `useSectionSave`). One profile row is loaded once and every section saves through the existing partial `updateMyProfile`, so there is a single source of truth; reminders and password stay on their own pages and are linked, not copied. `validateProfileInput` gained the two visibility fields. Weekday label helpers moved to `weekFormat.js` and are shared with the reminder page. Not committed.

## App navigation
The navbar now shows My Day, Week, Reminders and Settings (APP_LINKS) instead of the public links while signed in, on desktop and in the mobile menu, with the current page marked (aria-current). Public links are unchanged for signed-out visitors. Settings and the other app pages were previously reachable only from buttons on /app. tests/unit/navbar.test.jsx. Not committed.
