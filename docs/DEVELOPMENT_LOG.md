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

## Recurring tasks
`/app/recurring` lists repeating templates (one-off tasks excluded) by status via `groupRecurringTemplates`/`templateStatus`, with edit (existing `updateTemplate`), end (`archiveTemplate`) and delete-before-start (`deleteTemplate`). Repeat fields were extracted from `AddTaskForm` into `RepeatFields` and are shared. Service fix: `updateTemplate` now reports validation as `details.fields` with a friendly message like `createTemplate`/`updateOccurrence`, so the form can show field errors. Navbar: five app links; labels no longer wrap between 900 and 1200px (checked in headless Chromium). Not committed.

## Progress
Added `/app/progress`: recent weeks reuse `getWeekSummary`; repeating-task consistency is the new pure `summarizeHabits` (`utils/planner/habits.js`) behind a new service operation `getHabitProgress` that reuses `fetchRange` and `listTemplates`. No schema change: a habit is a recurring template and a check-in is an occurrence (spec 15). The purity and hygiene guards caught the word "window" in two messages and the page wording test caught an early description that mentioned streaks; both were reworded. Corrected stale README/spec/tracker statements that said no UI used the planner. Not committed.

## Missed-day recovery notes
Approved copy lives in `src/constants/recoveryCopy.js`. Rules are pure (`utils/planner/recovery.js`: `recoveryStatus`, `isMissedPlannedDay`, `missedDaysInWeek`) and reuse `summarizeDay`/the weekly entries, so "missed" means a past, recorded, non-rest day with active tasks and zero progress. New read-only service operation `getRecoveryStatus` (reuses `fetchRange`); the weekly note needs no request because it reads the week summary already loaded. `GentleNote` and `useDismissible` are shared by both screens. No schema change. Not committed.

## Chromium visual QA (mocked auth and data)
Week (with a day selected, an earlier week), Progress, My Day (welcome-back note, dismissal, Move form), the mobile menu, and the loading, empty and error states were inspected in headless Chromium at 1440px and 390px against the real dev server, with a fake session and stubbed local REST responses (NOT Supabase) and the browser clock pinned to 10 March 2026. Checked: horizontal scroll, off-screen and clipped elements, console errors, failed requests, container widths. Fixed: today's date line wrapped and misaligned its card (now a separate badge); text buttons (Dismiss, See recent weeks, Remind me) were indented off the content edge; the Progress current-week chip pushed View week onto its own line on phones. Regression assertions added to the weekly and progress tests. The QA script itself is a scratch tool and is not part of the repository.

## Core journey verification
Added `tests/db/journey.integration.test.js`: one test drives the real routes and pages through sign-in, planning, editing, completing, moving, setting aside, Week, Progress, recurring-task editing, and a return two days later, with the app clock and the database clock advanced together. It found one real gap: a future day created by moving a task to it showed no way to bring in its repeating tasks ("Start this day" only appears when the day does not exist). Fix: an "Add my repeating tasks" action on existing future days (reuses the idempotent day-opening operation), with a focused regression test. Real Supabase verification was again not possible (no .env, credentials or CLI). Not committed.

## Real-Supabase verification: preparation only
No `.env`, environment variables, Supabase CLI or `psql` were available, so no remote check was run. Prepared and tested offline: `supabase/verification/schema_checks.sql` (133 checks; passes on a database built from the migrations and detects 10 injected faults), `tests/support/serviceJourney.js` (23 steps, validated in PGlite including a deliberately broken isolation rule), `scripts/verify-supabase.mjs` with `scripts/lib/verificationGuards.js` (refuses unless the test project ref is declared and confirmed; refuses placeholders, local and custom URLs, and service-role or secret keys; never prints keys). Writing the schema check surfaced two wrong expectations of mine (a column that lives on another table; `user_id` must be insertable but not updatable), both fixed. Setup steps: docs/SUPABASE_SETUP.md section 6. Not committed.

## Supabase verification: unblocking pass
Added `--preflight` to scripts/verify-supabase.mjs (local only: Node version, variable names with set/missing/placeholder status, the safety guards; never values; no network), a guard that refuses privileged values in `VITE_` variables, and a rewritten, exact checklist in docs/SUPABASE_SETUP.md section 6 (PowerShell-first; SQL Editor route so the CLI is optional). The expected output is measured from the real files (schema check: 133 rows = 129 PASS, 4 REVIEW, 0 FAIL; runner: 27 lines) and guarded by tests that fail if the guide drifts from the SQL or the journey. Still no `.env`, credentials or CLI in this environment, so nothing was run against a hosted project. Not committed.

## Local credential helper
The real `.env` stayed byte-identical to `.env.example` across many checks (values were not being saved to C:ArcLoop.env). Added scripts/set-test-env.ps1: an interactive helper that writes the four verification variables locally with a hidden key prompt, a ref derived from the URL, a YES confirmation, refusal of service-role/secret keys and non-hosted URLs, no BOM, and no overwrite of a filled-in file without -Force. Tested here only with fake values on temporary files (the repo preflight accepted its output; the real .env was not touched). Not committed.

## Busy and Rest days: guided set-aside
My Day now uses the existing, tested `proposeSetAside` rule: choosing Busy or Rest shows a panel (`DayModePanel`, wording in `constants/dayModeCopy.js` from the spec) listing the open tasks the planner proposes, with "Set these aside" (one explicit `setAside` per task, sequential) or "Keep them all" (dismissal per day and mode via `useDismissible`). Nothing is changed until the person chooses; priority tasks are kept on a Busy day; done tasks are never proposed; the original-plan figure stays visible. Found while testing: the My Day integration tests never cleared localStorage, so a dismissal leaked between tests; fixed in the test setup. Not committed.

## Task editing: description, category, end time
The shared `TaskFields`/`taskForm` now carry description, category and end time (validation stays the planner's: lengths, time order, "an end time needs a start time"). Used by the add form, My Day's per-day edit (`updateOccurrence`, this day only) and Recurring Tasks (`updateTemplate`: untouched upcoming days follow, history and hand-edited days do not). Rows, cards and the week's day detail show the time range, category and description; the weekly task view carries `plannedEnd`. Integration tests added in the My Day and Recurring files.

## Committed Playwright suite
`playwright.config.js`, `e2e/support/stubApi.js` (in-memory PostgREST-style stub ported from the scratch QA harness, now with inserts, updates, deletes, the two unique rules and the two server-set timestamps), `e2e/support/fixtures.js` (pinned clock, stored session, automatic stub), `e2e/signed-in.spec.js` (15 specs, desktop and mobile). The first run found two harness defects: the stub fixture was not automatic, so tests that never named it hit a dead port; and "Done: X" locators also matched "Not done: X". Both fixed. Not committed.

## Repeating tasks: start and end dates
The Recurring Tasks edit form now has "Starts on" and "Ends on (optional)". No service or schema change: `updateTemplate` already wrote both dates and `planTemplateEdit` already reports days that no longer match. Found while testing: a date change that moves a card to another group re-mounted it and lost its "Saved…" summary; the notice now lives on the page keyed by task id. Semantics and the one undecided case are recorded in KNOWN_ISSUES.

## Browser suite: Reminders and Settings
`e2e/reminders-settings.spec.js` (14 specs x 2 projects): reminder settings, weekday validation, a task reminder set in My Day and removed on the Reminders page, real in-app delivery of a due daily reminder (claimed in the stub database first, not repeated after a reload), a not-yet-due reminder staying silent, notification permission handling for the browser's real state, Settings profile/privacy/links, the timezone prompt with a device timezone (`timezoneId`), and error/loading states. The stub's error and slow modes now cover reminder and full-profile reads. Not committed.

## Week "Coming up" undercount
Root cause: `summarizeWeek` only saw day records and their occurrences, and `getWeekSummary` fetched no templates, so a later day that had not been opened read as nothing planned. Fix: the top-up predicate was extracted from `occurrencesToCreate` into `templatesDueOn` (match the date, not already present in any state, not suppressed) and is now the single rule for both opening a day and projecting days after today in the weekly summary; the week service reads the user's templates (read-only, same query as opening a day) when the week has days after today. Expected tasks appear in a day's task list flagged `expected: true`. Tests: 7 pure cases (daily, weekday schedules, start/end dates, ended, duplicates in any state, suppression, rest day, past weeks), 2 mocked-service cases (templates read, no writes, no read for past weeks), 1 PGlite case (no records created, count stable after opening a day and after a removal), journey and browser assertions updated (the journey's figure rose from 1 to 6 for the right reason). Not committed.

## Week projection: today included
`summarizeWeek` now projects repeating tasks onto today while it has no record (previously only days after today), so a fresh day reads "not started yet" with its expected tasks instead of "no plan recorded". A day with a record is always shown from that record. New `tests/db/weekProjection.integration.test.js` (6 cases through the real service in PGlite): unopened today creates nothing; an opened today is authoritative; a template edit leaves history alone, refreshes opened untouched days (existing behaviour) and projects unopened days from the current template; moved and set-aside copies are present and never re-added; a future rest day is projected and an ended task is not after today; the profile timezone decides which day is today (Auckland vs New York at the same instant). Pure tests gained the today cases and the inclusive-end-date case. Eight earlier expectations written for the days-after-today rule were updated for the right reason. Not committed.

## My Day preview of repeating tasks, and Week totals meaning
`expectedTaskView` now lives beside `templatesDueOn` and is used by both the Week projection and a new `expected` field on every day plan from the service (`fetchExpected`: same template read and rule as `openDay`; empty for dates that cannot be opened). My Day lists it under "Start this day" (unopened day) and shows "Add my repeating tasks" only when a future day is missing something, with the list. Opened today and the editable past keep the spec's lazy top-up on open (D10), so no explicit action is needed there. Week totals: an unopened today's expected tasks count as remaining (card label "Not started yet"), and "Coming up" means after today only. Tests: 2 mocked-service cases (preview equals the action's result; template created after the record; never for history), 4 My Day integration cases (unopened day preview and no duplicates; no repeating tasks; opened future day offers the action only for later templates; today is topped up on open), the pure label case, and the Week totals expectations rewritten for the remaining-versus-coming-up meaning. Not committed.

## Frontend release preparation
Checked in a real Chromium against the stubbed API: every signed-in screen (My Day, Week, Progress, Recurring tasks, Reminders, Settings) and every public screen (home, challenges, log in, sign up, forgot password, privacy, terms, contact, not found) at 390x844, 768x1024 and 1440x900: no horizontal overflow, one h1 and one main landmark per page, no unnamed buttons or links, no console errors or page errors, visible 3px keyboard focus, nothing animating under reduced motion. Two real findings fixed: page subtitles were rendered as h6 (MUI's default for subtitle1), skipping heading levels, so the theme now maps subtitle1/2 to paragraphs; and opening a not-yet-loaded page while offline showed React Router's developer error screen, so page routes now sit under `RouteError` ("This page didn't load", offline wording when the browser reports it, retry, back to home; the navigation stays). New `e2e/release-checks.spec.js` covers both. Playwright now runs two workers (`playwright.config.js`): eight parallel workers made timing-sensitive specs fail randomly, each passing alone. Production bundle scanned for key-shaped strings: the only match is supabase-js's own `sb_secret_` prefix check. Results: eslint clean, 960 Vitest tests, build OK, 74 Playwright tests. Not committed; hosted Supabase, deployment and non-Chromium browsers remain unverified.

## Backend migration, phase 1: Django + SQLite alongside Supabase
Added `backend/` (Django 5.2, Django REST Framework, SQLite, django-cors-headers) with accounts (profile, hashed expiring bearer tokens, register/login/logout/password change/reset, rate-limited public endpoints), planner tables and reminder tables with the Postgres trigger and RLS rules reimplemented in Python (`planner/rules.py`, `planner/resources.py`, `reminders/resources.py`), a generic user-scoped collection view (`config/resources.py`) and one error shape (`config/errors.py`). Frontend: shared API client (`src/services/api/apiClient.js`), a Supabase-shaped Django client so the planner and reminder services are unchanged (`djangoClient.js`; the query builder moved from `tests/support` into `src/services/api`), a backend selector (`src/services/backend.js`, `VITE_BACKEND=django`), a Django branch in `authService.js`, `profileService` on the selected client, and the update-password page handling the emailed `uid`/`token` link and a signed-in change with the current password. Supabase code was not removed. A real run found and fixed: string defaults on time/date model fields breaking serialisation, a string accepted as a completion value, and my own test patches recursing. Existing static-analysis tests were updated for the new seam (env allow-list, entry point reads the data client through the selector). ESLint now ignores `backend/` (the virtualenv's admin JS). Results: backend 51 tests; Vitest 987 passed (55 files); Playwright 74 passed (Supabase stub); build and lint clean; `npm run verify:django` 23 of 23 steps against a real local server and a temporary SQLite file. Not done: a browser run against Django, deployment, SMTP, removal of Supabase (see docs/DJANGO_MIGRATION.md). Nothing was committed by this session.

## Backend migration, phase 2: Django is the only backend
Real-browser tests against the real stack: `playwright.django.config.js` and `e2e-django/` start the Django API on a throwaway SQLite file (file email backend, CORS opened only for the test origin) and the Vite app built for it, on different origins. 15 specs x desktop and mobile (30 tests) cover registration with immediate sign-in, reload persistence, duplicate and weak-password refusals, logout, protected routes, a revoked token, CORS (allowed and hostile origin), password reset by emailed link in a second browser profile (single use), signed-in password change, a planner journey with reload, repeating tasks, settings and reminders persistence, two-user isolation by id, and account deletion. Findings fixed: SQLite `database is locked` on simultaneous writes (immediate transactions + WAL); a wrong current password showed the login message; the logout test helper assumed one layout.
Account deletion: `POST /auth/account/delete/` (password + typed DELETE, one transaction, staff refused, all sessions end), Settings dialog, 7 backend tests, 4 unit tests, browser test.
Email: SMTP, file and console backends selected by environment variables only; no credential in the repo; no real email sent. Registering still signs the user in (decision recorded in `docs/DJANGO_MIGRATION.md`).
Test infrastructure: a DEBUG-only `X-Test-Now` clock header (refused unless debug), a fast hasher on that test server, a Vitest `integration` project that starts a real server, and a harness replacing the PGlite one. Eight screen-level PGlite tests were ported (97 integration tests); the rest of `tests/db` was removed (see the migration doc for what covers it and what was lost). The stubbed Playwright suite was re-pointed at a Django-shaped stub (74 tests).
Real bugs found by the real-server runs: `useDayPlan` let a change that finished after navigating overwrite the new day's data and leave it on a loading skeleton (fixed, regression test); the bundle inlined the whole `import.meta.env` (every `VITE_` variable in `.env`) (now static reads + guard test).
Removal: `supabaseClient.js`, `@supabase/supabase-js`, `@electric-sql/pglite`, `supabase/`, the Supabase scripts and tests. SQL migrations and the setup guide archived in `docs/archive/supabase/`. Docs rewritten: README, SECURITY, PROJECT_STRUCTURE, FEATURE_TRACKER, KNOWN_ISSUES, DJANGO_MIGRATION, new DEPLOYMENT. Final results: backend 63, unit 665, integration 97, e2e 74, e2e-django 30, journey 23/23, lint and build clean. Not committed; nothing deployed.

## Production-readiness pass (18 October 2026)
Scope: security, recovery, timezones, responsive coverage, privacy and email decisions, monitoring. No deployment, no real email, no credential, no commit; the authentication architecture was **not** changed.
- **Auth analysis** (`docs/AUTH_SECURITY.md`): localStorage bearer token vs HttpOnly cookie compared (theft, on-page abuse, CSRF, CORS, hosting topology, migration effort); recommendation conditional on hosting; decision requested.
- **CSP**: `deploy/securityHeaders.js` is the single definition; `vite preview` serves it for tests; `npm run csp:print` prints it for a host; report-only mode and a public, rate-limited, sanitised `POST /api/v1/csp-report/`. First run under enforcement failed (57 inline-style and a `data:` font violations): Emotion's empty `<style>` elements are subject to `style-src`, fixed with the hash of the empty string (admits empty tags, refuses injected CSS: tested) and `assetsInlineLimit: 0`; no `unsafe-*` directive. 40 Chromium tests: no violations anywhere, the app still styled, injected script / handlers / inline style markup / foreign fetch blocked.
- **Django hardening**: API response headers, security event log without secrets, production refuses to start without secret key / hosts / https frontend URL, reset links 1 hour, reset secret stripped from the URL (also fixed the wrong "same browser" wording), health endpoint, `DJANGO_CSRF_TRUSTED_ORIGINS`, HSTS and proxy header opt-in. **Real bug fixed**: a failing mail server returned 500 only for real accounts (an existence oracle exactly when mail is broken); now identical, logged by exception type only.
- **Backup/restore**: `accounts/backup.py` + `backup_db`, `restore_db`, `verify_db`. Online backup API (includes WAL: a plain copy missed a committed row in a test), partial-file + verify + rename, checksum sidecar, retention that touches only its own files, restore that refuses damaged/same-file backups, keeps the replaced database, builds and checks the copy before swapping, drops stale WAL/SHM. Procedure test on a disposable database: migrate, seed related records, back up, delete a user, refuse restore without `--yes` and with a corrupt file, restore, compare every table by row hash and the relationship counts, sign in with the restored password. Finding fixed: `verify_db` called a backup with flipped bytes "intact" (SQLite's check cannot see damage in unused space); it now checks the checksum. **Not done: a drill on a real setup, scheduling, off-machine storage.**
- **Timezones**: 11 server-side boundary tests; a JS-vs-server (Python zoneinfo) cross-check on ~37,000 sampled instants in 16 zones plus real day lengths; 9 end-to-end boundary tests through the real services; 4 new unit tests. **Real bug found and fixed**: JS `startOfLocalDay` chose the later midnight when midnight happens twice (Havana, 1 Nov 2026: 24 h instead of 25 h). Several of my own first-draft expectations were wrong (Lord Howe's offset, window arithmetic) and were corrected against the rules, not the code. Evidence for chosen cases only.
- **Responsive**: delete-account dialog tests at 1440, 768, 667x375, 390 and 320 px (fit, title and buttons always visible, focus trap and return, disabled until valid, touch targets). Looking at the screenshots found two real layout defects (cramped wrapped buttons at 320 px; title scrolling away on a short screen because the form was the scroll container): fixed (stacked buttons, flex-column form).
- **Docs**: `AUTH_SECURITY`, `BACKUP_RESTORE`, `EMAIL_DECISIONS`, `REMINDERS` (limitation + options A-E), `PRIVACY_POLICY_PROPOSAL` (not published, not legal advice), rewritten `DEPLOYMENT` (env vars, CSP rollout, monitoring table, blockers), updated SECURITY, KNOWN_ISSUES, FEATURE_TRACKER, PROJECT_STRUCTURE, README.
- **Results**: backend 103; unit 674; integration 111; Playwright stub 88; real-server Playwright 30; CSP Playwright 40; `verify:django` 23/23; lint and build clean; the bundle has no `VITE_` names. `check --deploy` with production-style settings: two optional HSTS extras only. Chromium only. Nothing committed.

## Same-origin API, cookie sessions, calendar export (18 October 2026)
Scope: decisions 1-4 (one site with `/api/`; HttpOnly-cookie auth as a separate tested change; immediate sign-in kept for the private beta; in-app reminders kept, `.ics` export first; no email, push or native). No deployment, no real email, no commit.
- **Same origin**: app calls `/api/v1`; Vite dev/preview proxy `/api` (Host preserved); `VITE_API_BASE_URL` optional; CORS default empty; CSP `connect-src 'self'`.
- **Cookie auth**: `arcloop_session` (HttpOnly, SameSite=Strict, Path=/api/, Secure in production) + readable `arcloop_csrf` echoed as `X-CSRFToken`; CSRF + Origin enforced on cookie-authenticated writes; bearer kept server-side for non-browser clients; login/register JSON only; frontend holds no token. Real cross-origin form POST refused (same-site is not same-origin).
- **Calendar export**: `planForRange` reuses `projectDay`; UTC-instant events, day-by-day repeats, stable UIDs, optional all-day and alert request; validated with `ical.js`. Real calendar apps untested; no notification guaranteed.
- **Found by looking**: the alert select showed blank for an empty value (sentinel `none`).
- **Results**: lint clean; build ok; backend 123; unit 755; integration 124; `verify:django` 23/23; Playwright stub 96; CSP 42; real-server Playwright 44. Chromium only.

## Security-readiness pass: 7-day sessions, proxy checks, audits (18 October 2026)
Scope: private-beta policy (7-day session, bearer kept, immediate sign-in kept, verified email required before shared features, HTTPS/CSP as launch gates). No deployment, no real email, no commit.
- **Session**: default lifetime 7 days (`DJANGO_TOKEN_LIFETIME_DAYS`), fixed, one credential (no refresh token); server-side expiry decides validity, cookie Max-Age derived. `SessionLifetimeTests` (day 6 ok, refused and cleared after day 7, use does not extend, CSRF-valid write refused after expiry); real-browser cookie Max-Age about 7 days.
- **Bearer**: retained; only the backend test helper (`as_user`) and bearer-path tests depend on it (`AUTH_SECURITY.md`).
- **Found and fixed**: rate limiting trusted a client-sent `X-Forwarded-For` (now `NUM_PROXIES` 0, or 1 behind the proxy; security log uses the same address); DRF 3.17.2 raises on oversized bodies, which would have been a 500, now `413 too_large`.
- **Audits**: `npm audit` 0. `pip-audit` found 2 advisories in DRF 3.16.1 (confirmed against OSV, fixed 3.17.2, Django 5.2 supported); pin moved to `>=3.17.2,<3.18` after the backend suite passed on it in a scratch virtualenv and again in the project one; re-audit clean. `AdminRenderer` finding: API is JSON-only (not applicable). Audits cover known advisories only.
- **nginx**: `deploy/nginx.example.conf` and `csp:print --nginx`; `nginx -t` ok (1.28.0); local self-signed-TLS rehearsal with production-mode Django (curl, not a browser). Production checklist: `DEPLOYMENT.md` section 10.
- **Process lesson**: scripted doc edits turned 15 files from LF to CRLF and broke a hygiene test; restored. A stray earlier verification script ran concurrently with the final one and skewed a first run; the final run below was clean and single.
- **Results (final single run)**: lint exit 0; build exit 0; backend 132 passed; unit 756 passed; integration 124 passed; `verify:django` 23/23; Playwright stub 96 passed; CSP 42 passed; real-server Playwright **43 passed, 1 failed** (mobile `planner.spec.js` isolation test: sign-up stayed on `/signup` for 10 s under load); the same test then passed 3 of 3 reruns alone (desktop and mobile). Treated as a load flake, not confirmed as one. No skipped tests reported. Chromium only.
- **Unverified**: real HTTPS, `Secure` cookie in a real browser, trusted hosts and `X-Forwarded-Proto` on a real host, HSTS, enforced CSP on a real host, SMTP/real email, backup restore drill, real calendar apps, Firefox/WebKit, physical devices.
