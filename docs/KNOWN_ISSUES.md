# Known issues and incomplete work

Backend: Django + SQLite (migrated from Supabase; see `docs/DJANGO_MIGRATION.md`). Nothing is deployed, no real email has been sent, only Chromium has been run.

## Backend and deployment
- **PostgreSQL (Neon) coverage.** The deployed API can use PostgreSQL (`DATABASE_URL`, `render.yaml`), and migrations run on it at every deploy. On 18 October 2026 the backend suite (148 tests), the whole integration project (142 tests, real API) and migration `planner/0002` (forward on existing rows, constraint, reverse, forward again) were run against a **disposable local PostgreSQL 16.2**, never against Neon or any real data. **Not** tested: Neon's pooler (PgBouncer, transaction mode), Render, any other PostgreSQL version, the browser suites on PostgreSQL. To repeat: set `DATABASE_URL` to a disposable PostgreSQL database and run `npm run test:backend` (use a fresh database for each integration run: some integration tests pin the clock and so create the same email every run).
- **Two simultaneous requests used to both "win" on PostgreSQL** (found 18 October 2026 by that run; SQLite hid it because it serialises writers). A conditional `PATCH` such as claiming a reminder ("not yet notified") read its rows and then wrote them without a lock, so two open tabs could both show the same notice, and two requests could both take the last Minimum Day place. `PATCH` now locks the rows it matches (`select_for_update`), and a day's minimum is changed one request at a time. Regression tests in `backend/tests/test_concurrency.py` run only on PostgreSQL (they are skipped on SQLite) and were seen to fail before the fix. Other writes that read-then-write without a lock (`DELETE`, the multi-step planner operations) have not been audited for the same race.
- **Backup tools are SQLite-only** (`backup_db`, `restore_db`, `verify_db` refuse to run on PostgreSQL). On Neon, backups are the provider's; the recovery drill in `docs/BACKUP_RESTORE.md` does not apply to a PostgreSQL deployment and nothing has been verified for it.
- **Not deployed, HTTPS unverified.** `docs/DEPLOYMENT.md` lists what a deployment needs and its blockers. A strict Content-Security-Policy now exists (`deploy/securityHeaders.js`) and is verified in Chromium against the production build, **but the frontend host must send it; nothing is deployed, so it is not in force anywhere.** HSTS is available and **off** until HTTPS is confirmed on the real domain. Still open: no SMTP provider chosen or tested, no scheduled or off-machine backups and no recovery drill on a real setup, no monitoring provider or alerting, draft privacy policy.
- **Cookie sessions are unverified over HTTPS.** Verified in Chromium over HTTP; `Secure`, proxy `Host`/`X-Forwarded-Proto` handling untested. On-page script can still act as the user while a page is open (CSP is the mitigation, not yet deployed). See `docs/AUTH_SECURITY.md`.
- **Dependency audit (18 Oct 2026):** `npm audit` 0 vulnerabilities. `pip-audit` (scratch virtualenv, installed backend packages) found 2 in djangorestframework 3.16.1; the pin is now `>=3.17.2,<3.18` (fixed version), tested, and a re-audit found none. Behaviour change handled: DRF 3.17.2 enforces Django's request-size limit and raises on oversized bodies, which would have been a 500, so the error handler answers `413 too_large` (tested). The proxy's 1 MB limit remains defence in depth. Audits cover known advisories only; repeat before launch.
- **Session lifetime is a fixed 7 days**, no renewal; the person signs in weekly.
- **Calendar export** was parsed with an independent library but never imported into a real calendar app; apps decide about alerts and may duplicate events on re-import. `docs/CALENDAR_EXPORT.md`.
- **CSP limits:** tested only in Chromium and only against `vite preview`; Firefox/Safari not tested; it relies on Emotion's production (CSSOM) mode and on allowing the hash of the empty string in `style-src`; extensions and other real-world noise are unknown until a report-only trial on the real site.
- **Reset-request timing:** a real account's request sends mail so it is slower than an unknown address's; not hidden (would need a background task). The body, status and log are identical.
- **Backups:** the tooling is verified on disposable databases only (`docs/BACKUP_RESTORE.md`); nothing schedules it; a restore resurrects accounts deleted after the backup and re-signs-in revoked sessions; recovery point = last good backup.
- **Monitoring:** only a health endpoint, a log convention and `verify_db` exist; no provider, alerting or on-call. Behind a proxy the client address in logs and rate limits is the proxy's unless forwarded.
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
- Removed (Postgres-specific): RLS, schema, migration-hygiene, profile-RLS, schema-check and PGlite-journey tests, and the JS-vs-PostgreSQL timezone cross-check. Their rules are tested by `backend/tests`. The JS-vs-server timezone agreement is now cross-checked on a sample (see Timezones below).
- Removed and **not ported**: the Postgres-era service integration tests (`plannerService`, `plannerSystem` including the randomised run against independent oracles, `reminders`). Service behaviour is covered by the mocked service tests, the ported screen-level integration tests, the backend suite and the 23-step journey. The "competing tab" race tests no longer exist.
- Full list and what covers what: `docs/DJANGO_MIGRATION.md`.

## Testing notes
- `npm test` runs both Vitest projects; the integration project starts a real Django server and needs the backend virtualenv. Use `npm run test:unit` for Node only.
- Integration tests make real HTTP requests, so screens settle more slowly than with an in-process database: they use a `user` helper that waits for a control to be usable and a 15 s Testing Library wait. Three clean repeated runs were made; a rare timing failure would be a test race, not necessarily a product bug.
- The fast Playwright suite (`npm run test:e2e`) uses an in-memory stand-in for the API (`e2e/support/stubApi.js`) and a pinned clock; it proves the UI, not the server. The real-server suite is `npm run test:e2e:django` (fresh SQLite file per run, ports 8100 and 5300). A cold Vite dev server can be slow on the first page; the login helper waits for it.
- Playwright uses 2 workers (more made timing-sensitive specs fail randomly on this machine; each passed alone).
- **Firefox, WebKit/Safari and physical devices were not run; offline behaviour is only the "page didn't load" case; background reminders do not exist.** Headless Chromium reports notification permission as "denied", so the "allowed" state of the Reminders page is covered by component tests only.
- In development React runs effects twice, so My Day can send two day-creation requests; the second is refused as a duplicate (409) and the service recovers. A 409 line in the console on a first visit is expected.

## Timezones and dates
- **What is verified, and only that:** server-side boundary tests (local midnight, the 7-date window, DST days, 30- and 45-minute offsets, the date line, a timezone change; `backend/tests/test_timezones.py`); a JS-vs-server cross-check of local date, wall-time round trip and real day length on about 37,000 sampled instants in 16 zones for 2026 (`tests/integration/timezoneAgreement.integration.test.js`); end-to-end boundary tests through the real services (`timezoneBoundaries.integration.test.js`); and the earlier JS unit tests with real DST dates. **This is evidence for the chosen cases, not proof that every zone, year or rule change is handled.**
- **Not covered:** years other than 2026; future tzdata changes (Python's `tzdata` package and the browser's ICU can differ in version: a disagreement would be a real finding); zones outside the 16 sampled; leap seconds; a device whose clock is wrong (the client uses the device clock to decide what to ask for, the server uses its own and refuses what is out of range); reminders on a real device.
- **A real bug the cross-check found and that is fixed:** when midnight itself happens twice (Havana, 1 November 2026), the JS "start of day" picked the later midnight, so that day measured 24 hours instead of 25 and the day before 25 instead of 24 (affects "time left today" and day-length figures only in such zones).
- **Known design choices:** a wall-clock time that does not exist (DST gap) resolves forward; one that happens twice resolves to the later instant; the start of a date is its first instant.
- **Reminders only while the app is open** (see Reminders and `docs/REMINDERS.md`); options for background delivery are written up and need your decision.

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
- Layout and basic accessibility (one h1 and sensible heading levels, labelled fields, named buttons, visible focus, reduced motion, no horizontal overflow) were inspected in Chromium at 390x844, 768x1024 and 1440x900 for My Day, Week, Progress, Recurring, Reminders, Settings and every public page, against the stub. Contrast was measured numerically for the main text and background pairs, not every state (hover, disabled). The delete-account dialog has its own responsive test and was looked at in screenshots at 1440, 768, 667x375, 390 and 320 px (fits; title and both buttons always visible; buttons stack on a phone; focus trapped and returned). Two layout defects found that way were fixed. Other new screens' phone layouts are covered by the earlier release pass.
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

## Minimum Day
- **Product decision still needed: the limit of 3 tasks is provisional and has not been confirmed.** Do not treat it as final. It is kept equal on the client and the server by a test, so changing it means changing `PLANNER_CONFIG.limits.minimumTasks` and `MAX_MINIMUM_TASKS` together.
- Saving a minimum is one request per task (at most six): not atomic. A failure midway leaves a valid minimum, never more than three; the person is told it was only partly saved, sees what is saved, and can choose again safely (nothing is created, so nothing duplicates). Tested with a server that fails the second write.
- Putting a set-aside task back, or undoing a move, does not re-choose it for the minimum; a moved task's copy is never flagged. This is deliberate (nothing is chosen on the person's behalf).
- The Week and Progress screens, reminders and the calendar export do not know about the minimum.
- Not tested: Firefox and Safari, real phones, a screen reader (the markup uses a labelled region, a fieldset-style group of checkboxes, `role="status"` for the message and `aria-live` for the count).

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
