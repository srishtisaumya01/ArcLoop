# Known issues and incomplete work

Backend: Django + SQLite (migrated from Supabase; see `docs/DJANGO_MIGRATION.md`). Nothing is deployed, no real email has been sent, only Chromium has been run.

## Backend and deployment
- **Not deployed.** `docs/DEPLOYMENT.md` lists what a deployment needs and its blockers: no Content-Security-Policy (sign-in tokens are in `localStorage`, so injected script could read them), HSTS left off until HTTPS is confirmed, no SMTP provider chosen or tested, no tested backup restore, no monitoring or error reporting, draft privacy policy.
- **SQLite is single-writer.** WAL mode and immediate transactions make simultaneous requests queue (up to 20 s) instead of failing; fine for one server, wrong for several instances or ephemeral disks. No replication or point-in-time recovery.
- **No email confirmation at sign-up.** Registering signs the user in immediately (intended for now). Anyone can register any address; a typo cannot be caught.
- **Password-reset email delivery has never been exercised.** Development prints it to the API console; the browser tests write it to a file. SMTP is environment-configured and untested.
- **Registering an existing email says an account may already exist** (reveals existence; a usability trade-off). Login and reset do not reveal it.
- **Account deletion** removes the live database rows only; earlier backups keep the data until they expire. Staff accounts cannot be deleted through the API.
- **Rate limiting** covers the public auth endpoints only (per client address). No account lockout, MFA or CAPTCHA.
- **Ids differ from the Supabase design:** planner rows keep UUIDs; users and profiles use integer ids.
- **Transactions:** multi-step planner operations (reschedule, remove with suppression, template edits, `createTask`, `undoReschedule`) are several requests. They are ordered and compensated so a failure loses nothing, and errors say what was done (`details.partial`), but a crash between requests can leave one half done. Only a batch insert is atomic on the server.
- **Provisional numbers** in the server rules: 200 active templates, 100 tasks per day, 200 hidden templates per day, 366-day sanity bound. The 7-date editing window is approved (D5).
- The admin (`/admin/`) is enabled; it is unstyled unless static files are collected, and should be restricted or disabled in production.
- **Test clock header:** a server started with `ARCLOOP_TEST_CLOCK=1` honours `X-Test-Now`. Settings refuse it unless debug is on; it must never be set in production.

## Test coverage removed with Supabase
- Removed (Postgres-specific): RLS, schema, migration-hygiene, profile-RLS, schema-check and PGlite-journey tests, and the JS-vs-PostgreSQL timezone cross-check. Their rules are tested by `backend/tests`. **The JS-vs-server timezone agreement is not cross-checked beyond the Auckland/New York cases.**
- Removed and **not ported**: the Postgres-era service integration tests (`plannerService`, `plannerSystem` including the randomised run against independent oracles, `reminders`). Service behaviour is covered by the mocked service tests, the ported screen-level integration tests, the backend suite and the 23-step journey. The "competing tab" race tests no longer exist.
- Full list and what covers what: `docs/DJANGO_MIGRATION.md`.

## Testing notes
- `npm test` runs both Vitest projects; the integration project starts a real Django server and needs the backend virtualenv. Use `npm run test:unit` for Node only.
- Integration tests make real HTTP requests, so screens settle more slowly than with an in-process database: they use a `user` helper that waits for a control to be usable and a 15 s Testing Library wait. Three clean repeated runs were made; a rare timing failure would be a test race, not necessarily a product bug.
- The fast Playwright suite (`npm run test:e2e`) uses an in-memory stand-in for the API (`e2e/support/stubApi.js`) and a pinned clock; it proves the UI, not the server. The real-server suite is `npm run test:e2e:django` (fresh SQLite file per run, ports 8100 and 5300). A cold Vite dev server can be slow on the first page; the login helper waits for it.
- Playwright uses 2 workers (more made timing-sensitive specs fail randomly on this machine; each passed alone).
- Firefox, WebKit and physical devices were not run. Headless Chromium reports notification permission as "denied", so the "allowed" state of the Reminders page is covered by component tests only.
- In development React runs effects twice, so My Day can send two day-creation requests; the second is refused as a duplicate (409) and the service recovers. A 409 line in the console on a first visit is expected.

## Offline and network failure
- There is **no offline mode.** A dropped connection shows a retry message ("This page didn't load" for pages not yet loaded; each data screen has its own error state with retry). Nothing is cached or queued.
- A brief outage does not sign anyone out: the stored session is kept; only a 401 from the server ends it.

## Daily Planning & Progress Engine
- **Provisional or interpreted (need product approval, spec 14.4):** 30-day plan-ahead limit; a pre-baseline delete does not fix the baseline; raising completion on a set-aside task restores it; weekly counts only include dates up to today; any Rest-mode day is excluded from averages; the average uses unrounded daily percentages; a partial task uses its full estimate in workload; a done task cannot be set aside, moved or removed.
- **Open for the service layer:** occurrences on dates a template edit no longer matches are reported (`noLongerMatching`) but not removed; a reschedule chain must be undone from the last move back.
- **Timezone validation:** a legacy alias with wrong inner capitalisation (for example `Asia/KolKata`) passes the JavaScript check; the server rejects names not in Python's IANA list.
- **Decisions D1-D12 are approved** (spec 11a), with C1 = option C (hard delete plus a per-day suppression list) and C2 = option B (a partly done task can be set aside or moved; a done task cannot).
- **Known design limitations:** time-only changes within a day are not audited; days never opened have no record (shown as "No plan recorded", never as 0%); original-plan progress uses a baseline stamped at the first completion or revision, so tasks added after that moment count only in the current plan.
- **Creating an identical template twice is allowed**; only one occurrence per template per day is.
- `NOT_FOUND` deliberately covers both "missing" and "not yours".
- **Privacy:** task text can contain health, family or location details. The draft Privacy Policy does not yet cover planner data, backups or deletion and needs legal review before launch.
- **Landing-page wording to review:** "Streaks without shame" (`landingContent.js`) and the sample preview's flame icon with "4 of 7 days" (`ProductPreview.jsx`). The spec has no streak counter in the MVP and forbids streak-loss language. The landing copy describes "habits and goals" while the product centre is the daily plan.

## Not functional by design (until later phases)
- Challenge join/leave is local component state; reloading resets it. Challenge data is sample data (`src/constants/demoChallenges.js`); Winter Arc 90 dates are "to be announced".
- The contact form does not send. `SITE_CONFIG.supportEmail` and the other identity fields in `src/constants/siteConfig.js` are empty on purpose and must be supplied by the owner.
- Legal pages are drafts, not reviewed by a lawyer.
- No onboarding step; no groups.

## Visual and accessibility scope
- Layout and basic accessibility (one h1 and sensible heading levels, labelled fields, named buttons, visible focus, reduced motion, no horizontal overflow) were inspected in Chromium at 390x844, 768x1024 and 1440x900 for My Day, Week, Progress, Recurring, Reminders, Settings and every public page, against the stub. Contrast was measured numerically for the main text and background pairs, not every state (hover, disabled). The new delete-account dialog was seen at desktop width in a failure screenshot only; not reviewed at phone width.
- MUI text-field focus uses MUI's border highlight rather than the global 3px outline used on links and buttons. It is visible but a different style.
- The landing page FAQ expand animation was confirmed to open and set `aria-expanded`; the animation itself was not reviewed frame by frame.
- Footer "Product" links use hash/route links; "Groups" is a landing-page anchor, not a page.
- Vitest first-import of lazy routes is slow, so tests use a 5 s async timeout (15 s in the integration project) and 20 s test timeout (60 s for integration).

## Welcome-back notes
- The note is based on the last planned day within 28 days (provisional). Someone away longer, or whose older days were never planned, sees nothing: absence alone is never treated as a missed day.
- A rest day or an empty day between does not hide an older unfinished planned day; the note follows the most recent planned day.
- Dismissals are kept in this browser only.
- The weekly note appears for any past or current week that has a past planned day with no progress, including earlier weeks opened for review.

## Progress
- Recurring-task figures cover the last 28 days and count only tasks still linked to their repeating task: if a repeating task is permanently deleted, its older records stay in My Day and the weekly numbers but drop out of this list.
- The page loads 8 weeks with one request set per week; not optimised for very busy accounts.
- Goals with targets are not built: the spec calls them a separate later concept and there is no approved data model.

## Recurring tasks
- **There is no pause or resume.** The planner has no paused state, and an ended task cannot be restarted; create a new one.
- Ending a task ends it after today. Days already opened keep their copy. Editing a schedule leaves already-planned days that no longer match in place and says so.
- Dates are inclusive; days already planned outside new dates are left in place and reported (never deleted); moving the start earlier never creates history; an end date before today ends the task (read-only under Ended, records kept).
- A future day only receives its repeating tasks when it is opened (on the day, or "Add my repeating tasks" / "Start this day"). My Day previews the exact list those actions add, from the same rule the Week uses (`templatesDueOn`). The Week's "Coming up" counts what each day from today on will hold; today is projected only while it has no record, and an unopened today counts under "Tasks remaining" (card reads "Not started yet"). End dates are inclusive. A planned future rest day still counts its expected tasks.

## Profile and timezone
- The timezone suggestion appears only while the profile is on the UTC default and the device reports a different zone. Dismissing it ("Not now", remembered per user in this browser) keeps UTC until changed on the profile page, so "today" follows UTC until then.
- A new account's timezone is `UTC` until the person sets it.
- The browser may report a zone by an older name; a small list maps six common ones to the modern name (e.g. Asia/Calcutta to Asia/Kolkata).
- Settings edits display name, timezone and the two visibility settings. Interests are stored but have no editor. Visibility is saved but does nothing yet: no feature shares data between people.
- The reminder settings page does not refresh by itself after a timezone change made elsewhere; reopening it does.

## Reminders
- **Delivery needs the app open.** Reminders are checked every 30 seconds by the page. If the tab or browser is closed, or the device sleeps, nothing is delivered, and a reminder is not replayed later than 2 hours after its time (provisional). Reliable background delivery would need a service worker with push and a server-side scheduler; neither exists.
- Browser notifications use the Notification API from the page. Some mobile browsers refuse that without a service worker, so there the in-app notice is the delivery. Real browsers were not tested for this; tests stub `Notification`.
- Task reminders are per day (one task on one date); a repeating task does not get a repeating reminder.
- Turning reminders off keeps task reminders the user set but delivers none.

## Weekly Overview
- `/app/week` shows a selected day read-only and links to My Day.
- A task can be moved to another day from My Day and the move undone. Undo is refused once progress was recorded on the new copy, and a finished task cannot be moved. Busy/Rest labels the day and offers (never forces) to set aside the proposed tasks; "Keep them all" hides the offer for that day and mode in this browser only. If applying the offer fails part-way, the tasks already set aside stay that way (each is reversible) and the rest are offered again.
- The next-week limit uses the provisional `planAheadDays` (30).
- The full run with default parallelism can use a lot of memory on small machines; `npx vitest run --maxWorkers=4` is the tested setting.

## Git
- `origin/main` still contains an earlier commit with a Claude co-author trailer. Rewriting history is the owner's decision and has not been done.
