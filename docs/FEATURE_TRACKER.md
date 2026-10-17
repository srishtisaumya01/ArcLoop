# Feature tracker

Legend: Done = built and verified as described. UI only = layout exists, no real behaviour. Not started. **Spec only** = requirements/design written in `docs/DAILY_PLANNING_SPEC.md`, no code. **Logic implemented** = pure JavaScript in `src/utils/planner/` with unit tests; no UI, database, migration or auth integration, so users cannot use it yet.

| Area | Feature | Status | Notes |
| --- | --- | --- | --- |
| Foundation | Vite + React JS, router, MUI theme, lint, tests | Done | Phase 1 |
| Design system | Tokens, MUI theme, logo, shared layout | Done | Phase 2 |
| Public | Landing page | Done | Sample content labelled |
| Public | Explore challenges (search, category + visibility filters, loading/empty/error) | Done (demo data) | Real data in Phase 5 |
| Public | Challenge details | Done (demo data) | Join/leave is UI only, not saved |
| Auth | Signup, login, logout, password reset request, reset callback (`/update-password`) | Built, not verified against real Supabase | Code + mocked-service tests + scripted browser run against a local mock. Needs credentials; see SUPABASE_SETUP.md |
| Auth | Session persistence/restore, auth-state listener, route guards (`/app`) | Built, same caveat | Guards are UI only; RLS is the real protection |
| Database | `profiles` table, RLS, grants, sign-up trigger (migration `20261017000000`) | Built; tested in PGlite, not on real Supabase | 19 policy tests |
| Auth | Signed-in `/app` page (account + profile read) | Minimal placeholder | Real dashboard is Phase 4+ |
| Public | Privacy / Terms | Draft | Not legally reviewed; sections marked for update |
| Public | Contact / support | UI only | No support email configured; form does not send |
| Public | Route-level code splitting | Done | See DEVELOPMENT_LOG |
| Backend | Planner tables (`task_templates`, `day_plans`, `task_occurrences`) | Migration written and tested in PGlite; **not applied to a real database** | `20261017100000_create_planner.sql`; spec section 15. Replaces the earlier `habits`/`habit_checkins` idea. No app code uses it yet |
| Backend | Challenge and group tables | Not started | Phase 5 |
| Auth | Account deletion (needs a trusted Edge Function) | Not started | |
| App | Settings (`/app/settings`): profile (display name, timezone), privacy (profile/progress visibility), reminders status with a link to the reminder page, account email, link to the existing password flow; unsaved-changes notice, Save and Discard per section; a calm prompt offers the device timezone while the profile is still on the UTC default | Built; 15 integration tests with the real profile service in PGlite + 9 unit tests; **not run in a real browser or on real Supabase** | Interests are stored but not editable (nothing uses them). No planning preferences exist in the data model, so none are shown. No account deletion. Visibility has no effect yet because nothing is shared |
| Planner | Tasks: add, edit, complete, uncomplete, delete; times, estimate, category, priority, recurrence (once / daily / weekdays) | Logic implemented (validation, recurrence, completion, set-aside, removal, template-edit planning); UI and persistence spec only | DP-01..DP-07. Deletion follows C1 (suppression list) |
| Planner | My Day: chronological checklist, counts, progress with visible method, calm messages, empty states, plan tomorrow | Spec only | DP-08..DP-11, DP-17 |
| Planner | Progress engine: equal-weight units (0 / 0.5 / 1), zero-task handling, original vs revised plan, immutable plan snapshots | Logic implemented, unit-tested | Section 5 and 14; integer percentage maths; mutation-checked |
| Planner | Remaining effort and "what fits" (only with sufficient estimates) | Logic implemented, unit-tested | DP-11. Partial task uses its full estimate (provisional) |
| Planner | Day modes: Normal, Busy/Festival, Rest; set aside / restore; reschedule with history | Logic implemented, unit-tested | DP-12..DP-16. Partial tasks may be moved (C2 = B). No audit of time-only changes (D6) |
| Planner | Sleep, meals, exercise, hydration as ordinary user-defined tasks (no medical advice, no calorie mechanics) | Spec only | Spec section 3F |
| Planner | History: past-day review, recovery after missed days, weekly summary (no streak counter) | Logic implemented (weekly metrics, snapshots, 7-date edit window); screens and queries spec only | DP-18..DP-20. Days with progress this week; Monday start |
| Planner | Timezone handling (profile timezone, local dates, DST) | Logic implemented; cross-checked against PostgreSQL (PGlite) for 8 zones | Gap resolves forward, overlap to the later instant. Hosted Supabase not tested |
| Planner | Owner-only RLS, column grants, 7-date window and delete protections for planner tables | Implemented; 93 PGlite tests + mutation check; **not verified on real Supabase** | Spec sections 8 and 15; `docs/SECURITY.md` |
| Planner | Services layer (`src/services/planner/`): day plans, tasks, templates, completion, set-aside and restore, rescheduling, removal, day modes, snapshots, weekly summary | Implemented; 130 mocked tests + 42 PGlite integration tests + 15-case mutation check; **not run against real Supabase; no UI uses it** | Spec section 16. Not transactional (no server functions) |
| Planner | System-level integration tests (logic + services + migration together): persistence across sessions, recurrence across dates, timezone and window agreement, history preservation, error-leak checks, randomised run vs independent oracles | Verified in PGlite (21 tests); **not on real Supabase; no browser or UI testing because no planner UI exists** | `tests/db/plannerSystem.integration.test.js`; DEVELOPMENT_LOG |
| Planner | My Day screen (`/app/day?date=`): checklist with not done / partly / done, progress with its method, add one-off or repeating tasks (every day / selected weekdays), edit a task for the day, remove with confirmation, stop repeating, set aside and put back, day type, past/future/read-only handling, loading/empty/error states | Built; 9 integration tests drive the real service against the real migration in PGlite; **not run in a real browser or against real Supabase** | Moving a task to another day (with undo, and "moved to / moved from" notes) is built. Not yet: a screen listing all repeating tasks, plan-tomorrow flow |
| Planner | Weekly Overview screen (`/app/week`): Monday-Sunday navigation, current-week marker, 7 day cards, weekly summary, read-only day detail, loading/empty/error states | Built; component tests with a mocked service and real weekly maths; **not run in a real browser or against real Supabase** | Day detail is read-only and links to My Day. Uses `plannerService.getWeekSummary` |
| Planner | Reminders: user settings (on/off, time, weekdays, reset), optional per-task reminder, in-app notice, optional browser notification, upcoming list (`/app/reminders`, My Day "Remind me") | Built; migration `20261018000000` + 15 logic tests + 12 DB/service tests + 14 UI tests (real services in PGlite); **delivery works only while Arcloop is open in a tab; no push, service worker or server scheduler; not verified in a real browser or on real Supabase** | Duplicate prevention: delivery is claimed in the database first |
| Planner | Recurring Tasks screen (`/app/recurring`, fifth navigation link): all repeating tasks grouped Active / Not started yet / Ended, edit (title, time, estimate, priority, schedule), end with confirmation, delete a task that has not started | Built; 9 integration tests (real planner service in PGlite) + unit tests; layout checked in headless Chromium at 390 to 1280px with a stubbed API; **no pause/resume (the planner has no paused state); not run against real Supabase or a physical phone** | Ended tasks are read-only history |
| Planner | Service error model (`PlannerServiceError`, 8 codes, no database wording leaked) | Implemented, unit-tested | Spec 16.3 |
| Planner | Challenge / community integration (aggregates only, optional links) | Not started | Spec section 9; deliberately later |
| App | Timezone set-up for new users | Done as a prompt + profile page (see above); no forced onboarding step | A user can still dismiss it and stay on UTC |
| App | Real challenge membership, progress, leaderboard | Not started | Phase 5 |
| App | Groups, invitations, privacy-aware sharing | Not started | Phase 5 |
| App | Profile, settings, account deletion | Not started | |
| Quality | Playwright e2e | Not started | Package installed; no specs written |
| Launch | DEPLOYMENT.md, launch checklist | Not started | Phase 6 |
