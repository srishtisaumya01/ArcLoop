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
