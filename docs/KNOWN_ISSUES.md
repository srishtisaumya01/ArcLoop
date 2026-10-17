# Known issues and incomplete work

## Planner services layer (tested with mocks and in PGlite; no UI)
- **Not run against a real Supabase project or PostgREST.** The PGlite adapter (`tests/support/pgliteSupabase.js`) emulates PostgREST row shapes and error codes. Unverified for real: `maybeSingle`, `.is(col, null)`, `.range` and `.delete().select()` behaviour, the project's maximum-rows setting (reads are paged at 1,000, assuming the default), and the SQLSTATE codes in real responses. Mocked tests do not prove RLS; the integration tests do so only inside PGlite.
- **Not transactional.** Reschedule, remove-with-suppression, template edits, `createTask` and `undoReschedule` are several statements. They are ordered and compensated so a failure loses nothing, and errors say exactly what was done (`details.partial`), but a crash between statements can leave one half done. Server functions are the fix (also listed under the migration).
- **A new account's timezone is `UTC`** until onboarding sets it, so "today" follows UTC until then. Onboarding must collect it before My Day.
- **One profile read per call** for the timezone; no caching.
- **Nothing uses the services yet** (bundle unchanged). Hooks and the My Day screen are the next phase.
- **Creating an identical template twice is allowed**; only one occurrence per template per day is.
- `NOT_FOUND` deliberately covers both "missing" and "not yours"; a UI cannot tell them apart.
- The full suite now takes about 107 seconds (`tests/db` is most of it).

## Planner database migration (written and tested in PGlite only)
- **Not applied to any real database.** `20261017100000_create_planner.sql` has only run in PGlite with stand-in Supabase roles. PostgREST, hosted Postgres defaults, the Supabase auth service, concurrency and policy performance at scale are untested. Follow `docs/SUPABASE_SETUP.md` before relying on it. It requires PostgreSQL 15+.
- **No server functions yet** (`ensure_day_plan`, `reschedule_occurrence`, `delete_task_template`): day top-up, reschedule and delete-plus-suppress are several client statements, not one transaction. The database does not check that a `rescheduled_from_id` source is set aside as `rescheduled`, or that a deleted task's template was suppressed; the planner logic does.
- **Explicit "delete history"** does not exist; clients cannot delete old days or rows with progress.
- **Provisional numbers in SQL:** per-user caps (200 templates, 100 occurrences per day, 200 suppressed ids) and the 366-day sanity bound. Changing them needs a new migration. The 7-date window is approved (D5).
- **Test clock:** the database tests replace `planner_now()` with a settable clock in the test database only; production uses `now()`.
- **Information leak (minor):** a foreign-key error on a guessed id can reveal that the id exists somewhere; ids are random UUIDs.
- **Test cost:** `tests/db` now takes about 60 seconds of the full suite.

## Daily Planning & Progress Engine (pure logic implemented; no UI)
- **What exists:** pure, unit-tested logic in `src/utils/planner/` (spec section 14). **What does not:** any planner screen, service, migration, RLS policy or persistence. The proposed schema in `docs/DAILY_PLANNING_SPEC.md` is untested and unapplied; it now includes `suppressed_template_ids` and a relaxed `completion < 1` check (rulings C1, C2).
- **Provisional or interpreted (need product approval, spec 14.4):** 30-day plan-ahead limit; a pre-baseline delete does not fix the baseline; raising completion on a set-aside task restores it; weekly counts only include dates up to today; any Rest-mode day is excluded from averages; the average uses unrounded daily percentages; a partial task uses its full estimate in workload; a done task cannot be set aside, moved or removed.
- **Open for the service layer:** occurrences on dates a template edit no longer matches are reported (`noLongerMatching`) but not removed; a reschedule chain must be undone from the last move back.
- **Timezone validation:** a legacy alias with wrong inner capitalisation (for example `Asia/KolKata`) passes the JavaScript check; the database check is authoritative. The JS/PostgreSQL cross-check covers 8 zones and 2026 only, using two bundled tz databases, not a hosted Supabase instance.
- **Test cost:** `tests/db/planner.timezones.test.js` takes about 40 seconds because it checks tens of thousands of conversions against PGlite.
- **Prerequisite not met:** Phase 3 auth/RLS has not been verified against a real Supabase project. Planner migrations should wait for that.
- **Superseded plan:** the master prompt's `habits` / `habit_checkins` / `goals` model and "Phase 4: habit CRUD" are replaced by templates, day plans and occurrences. Longer-term goals with targets are not covered.
- **Landing-page wording to review** (not changed in this task): "Streaks without shame" (`landingContent.js`) and the sample preview's flame icon with "4 of 7 days" (`ProductPreview.jsx`). The spec has no streak counter in the MVP and forbids streak-loss language. The landing copy describes "habits and goals" while the product centre is now the daily plan; align when My Day ships.
- **Decisions D1-D12 are all approved** (spec 11a). The two contradictions found before implementation were ruled on: **C1 = option C** (hard delete plus a per-day suppression list; the owner chose this over the recommended option B) and **C2 = option B** (a partially completed task can be set aside or moved; a done task cannot). The 30-day plan-ahead limit remains provisional.
- **Known design limitations:** time-only changes within a day are not audited in v1; days never opened have no record (shown as "No plan recorded", never as 0%); original-plan progress uses a baseline stamped at the first completion or revision, so tasks added after that moment count only in the current plan.
- **Privacy:** task text can contain health, family or location details. The draft Privacy Policy does not yet cover planner data and needs updating and legal review before launch.
- **DST and timezone logic** is now tested on real DST dates (New York, London, Lord Howe, Havana) and cross-checked with PostgreSQL via PGlite; it still has not been run against a hosted Supabase project.

## Phase 3 (auth + database)
- **Not verified against a real Supabase project.** No credentials, Docker, `psql` or Supabase CLI were available. Verified instead: SQL + RLS in PGlite with stand-in roles (`tests/db`), service behaviour with mocks, and the real `supabase-js` client in Chromium against a local mock server that is not Supabase. Run the manual checklist in `docs/SUPABASE_SETUP.md` before relying on it.
- Without `VITE_SUPABASE_*` set, auth pages show "Accounts are not available right now" and disable submit; `/app` redirects to `/login`.
- PKCE reset links only work in the browser that requested them (a different browser shows "This link has expired").
- Email confirmation, redirect allow-list, password length and SMTP are dashboard settings that cannot be set from code. See `docs/SUPABASE_SETUP.md`.
- No onboarding, profile editing, or account deletion yet. Deleting an auth user cascades to the profile, but there is no UI or trusted function to delete an account.
- Migrations are forward-only; there is no rollback script.
- The only tables are `profiles`. Habit/challenge/group data is still demo data or not built.
- Session lives in localStorage (supabase-js default). Add a Content-Security-Policy at the host before launch.
- Terms/Privacy drafts were edited to match the current code but remain unreviewed drafts.

## Not functional by design (until later phases)
- Challenge join/leave is local component state. Reloading resets it.
- Contact form does not send. `SITE_CONFIG.supportEmail` and the other identity fields in `src/constants/siteConfig.js` are empty on purpose and must be supplied by the owner.
- Challenge data is sample data (`src/constants/demoChallenges.js`). Winter Arc 90 dates are "to be announced".
- Legal pages are drafts, not reviewed by a lawyer. Sections marked "Update after backend integration" must be verified against the real implementation.
- Password rule (min 8 characters) is client-side only; align with Supabase settings in Phase 3.

## Open items
- There is no offline mode. A dropped connection shows a retry message (route load failures: "This page didn't load"); nothing is cached or queued.
- Browser tests (`npm run test:e2e`) run the real app in Chromium against an in-memory stub of the Supabase REST and auth endpoints; they do not touch a hosted project. Firefox and WebKit are not run. Headless Chromium reports notification permission as "denied" and ignores granted permissions, so the "not asked yet" and "allowed" states of the Reminders page are covered by component tests only.
- Browser checks were run on Chromium only (no Firefox/WebKit/Safari).
- Contrast was measured numerically for the main text/background pairs, not exhaustively for every state (hover, disabled).
- MUI text-field focus uses MUI's border highlight rather than the global 3px outline used on links and buttons. It is visible but a different style.
- The landing page FAQ expand animation was confirmed to open and set `aria-expanded`; the animation itself was not reviewed frame by frame.
- Footer "Product" links use hash/route links; "Groups" is a landing-page anchor, not a page.
- Vitest first-import of lazy routes is slow, so tests use a 5 s async timeout and 20 s test timeout (`tests/setup.js`, `vite.config.js`).
- Git: a single commit ("first commit", 127 files) is on `main` and pushed to `origin` (github.com/srishtisaumya01/ArcLoop). Later documentation edits are uncommitted.

## Real-Supabase verification (prepared, not yet run)
- **Not run.** No test project, credentials or Supabase CLI have been available, so nothing has been verified against a hosted project. What exists: a read-only schema check (`supabase/verification/schema_checks.sql`, tested against the migrations in PGlite), a guarded runner (`scripts/verify-supabase.mjs`) whose 23-step journey is validated in PGlite, and the setup steps in `docs/SUPABASE_SETUP.md` section 6. The runner's network, sign-in and PostgREST paths have never executed. `node --env-file=.env scripts/verify-supabase.mjs --preflight` checks readiness locally without contacting anything.
- **Four helper functions** (`planner_max_active_templates`, `planner_max_occurrences_per_day`, `planner_valid_weekdays`, `reminder_weekdays_valid`) have no explicit privilege handling; on a hosted project the default grants may let `anon` call them through the API. They are pure constants and validators. The schema check reports them as REVIEW items; decide after reading the real result.
- Test users created by the runner cannot be deleted by it (that needs a privileged key it deliberately does not use); delete them in the dashboard.

## Core journey
- The end-to-end journey test uses the real app routes, pages, services and migrations in PGlite, but sign-in is simulated at the mocked auth boundary. Real Supabase sign-in, email flows, PostgREST behaviour and RLS on a hosted project are still unverified: no test project or credentials have been available.
- A future day only receives its repeating tasks when it is opened (on the day, or with "Add my repeating tasks" / "Start this day"). My Day previews the exact list those actions add, from the same rule the Week uses (`templatesDueOn`), so preview, action and Week always agree. The Week's "Coming up" counts what each day from today on will hold, including repeating tasks not added yet (same rule as opening a day; nothing is created). Earlier days are never projected: they show what was recorded. **Today is projected only while it has no record**; once today has a record (My Day creates it on the first visit), that record is authoritative, and a repeating task created later joins it when My Day next opens the day. An unopened today counts under "Tasks remaining" (its card reads "Not started yet"), the same meaning the figure has once the day is opened; "Coming up" means days after today. Today with a record never gains projected tasks: My Day tops it up whenever it opens the day (lazy materialisation, spec D10), so a repeating task created later simply appears on the next visit; for future days the explicit "Add my repeating tasks" action is the only way in, and it is offered only when something is missing. End dates are inclusive, so a task ended (archived) today still belongs to an unopened today, exactly as opening the day would add it. A planned future rest day still counts its expected tasks, because rest only labels a day.

## Visual QA scope
- Layout has been inspected in headless Chromium at 1440px and 390px only, for Week, Progress, My Day and the mobile menu, with mocked sign-in and data. Recurring Tasks, Reminders and Settings were not part of that pass (Recurring Tasks was checked earlier at the same widths; Reminders and Settings were not). No tablet widths, other browsers, or physical devices were tested, and there are still no committed e2e specs.
- In development, React runs effects twice, so My Day sends two day-creation requests; the second is refused as a duplicate and the service recovers. A 409 line in the dev console on a first visit is expected.

## Welcome-back notes
- The note is based on the last planned day within 28 days (provisional). Someone away longer than that, or whose older days were never planned, sees nothing: absence alone is never treated as a missed day.
- A rest day or an empty day between does not hide an older unfinished planned day; the note follows the most recent planned day.
- Dismissals are kept in this browser only, so another browser or device shows the note again.
- The weekly note appears for any past or current week that has a past planned day with no progress, including earlier weeks you open to review.

## Progress
- Recurring-task figures cover the last 28 days and count only tasks still linked to their repeating task: if a repeating task is permanently deleted, its older records stay in My Day and the weekly numbers but drop out of this list.
- The page loads 8 weeks with one request set per week; fine for now, but it is not optimised for very busy accounts.
- Goals with targets are not built: the spec calls them a separate later concept and there is no approved data model.

## Recurring tasks
- **There is no pause or resume.** The planner has no paused state (a repeating task is running or ended), and an ended task cannot be restarted; create a new one. Adding pause would need a data-model decision.
- Ending a task ends it after today. Days you already opened keep their copy (remove them in My Day). Editing a schedule leaves already-planned days that no longer match in place and says so.
- Title, times, estimate, category, description, priority, schedule and the start and end dates are editable here. Date semantics follow the existing rules, not new ones: dates are inclusive; days already planned outside the new dates are left in place and reported (never deleted); moving the start earlier never creates history (days never opened have no record); an end date before today ends the task (it becomes read-only under Ended, records kept). **Not decided by the spec, so not offered:** restarting an ended task by extending its end date; the Ended card stays read-only and a new task must be created.

## Profile and timezone
- The timezone suggestion appears only while the profile is on the UTC default and the device reports a different zone. A person who really is on UTC is never prompted; a person who dismisses it ("Not now", remembered per user in this browser only) keeps UTC until they change it on the profile page, so their "today" follows UTC until then.
- The browser may report a zone by an older name; a small list maps six common ones to the modern name (e.g. Asia/Calcutta to Asia/Kolkata). Other legacy names are listed as the browser gives them.
- Settings edits display name, timezone and the two visibility settings. Interests are stored on the profile but have no editor because nothing uses them yet. Visibility choices are saved but do nothing yet: no feature shares data between people. Account deletion needs a trusted server function and is not available. Password changes use the existing reset-link flow.
- The reminder settings page does not refresh by itself after a timezone change made elsewhere; reopening it does.

## Reminders
- **Delivery needs the app open.** Reminders are checked every 30 seconds by the page itself. If the tab or browser is closed, or the device sleeps, nothing is delivered, and a reminder is not replayed later than 2 hours after its time (provisional). Reliable background delivery would need a service worker with push and a server-side scheduler; neither exists and neither was faked.
- Browser notifications use the Notification API from the page. Some mobile browsers refuse that without a service worker, so on those the in-app notice is the delivery. Real browsers were not tested; the tests stub `Notification`.
- Task reminders are per day (one task on one date). A repeating task does not get a repeating reminder; the user sets it on the day.
- Turning reminders off keeps task reminders the user set but delivers none of them.

## Weekly Overview
- `/app/week` shows a selected day read-only and links to My Day.
- A task can be moved to another day from My Day and the move undone. Undo is refused once progress was recorded on the new copy (clear it first), and a finished task cannot be moved. There is no screen listing all repeating tasks (they can be created, and stopped from a task's Remove dialog, which ends the task after today). Choosing Busy/Rest labels the day and offers (never forces) to set aside the tasks the planner proposes; "Keep them all" hides the offer for that day and mode in this browser only. If applying the offer fails part-way, the tasks already set aside stay that way (each is reversible) and the rest are offered again.
- Tested with a mocked planner service (real weekly calculations); not checked in a real browser or against real Supabase. Layout at phone width was not visually verified.
- The full test run with default parallelism can crash PGlite workers on low memory; `npx vitest run --maxWorkers=4` passes.
- The next-week limit uses the provisional `planAheadDays` (30).

## Integration verification findings
- *(Historical, from the integration audit.)* At that time there was no planner UI. The screens have since been built, but they have only been checked with component tests against PGlite and, for layout, a headless Chromium run with a stubbed API; there are still no committed e2e specs.
- The system-level tests (`tests/db/plannerSystem.integration.test.js`) run in PGlite through a test adapter, not on a real Supabase project or PostgREST.
- The randomised system run did not, on its own, catch three deliberate faults (reschedule to a read-only day, rest days in the weekly average, the 99% cap); the unit tests do. It was strengthened with probes, but the re-check against those faults was not completed.
- Fixed: `PlannerServiceError.cause` was enumerable and could leak the raw database error when an error was serialised.
