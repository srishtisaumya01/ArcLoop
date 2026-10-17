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
| Backend | Planner tables (`task_templates`, `day_plans`, `task_occurrences`) | Spec only | Proposed schema in spec section 6; replaces the earlier `habits`/`habit_checkins` idea |
| Backend | Challenge and group tables | Not started | Phase 5 |
| Auth | Account deletion (needs a trusted Edge Function) | Not started | |
| App | Onboarding (display name, timezone, interests, privacy), dashboard | Not started | |
| Planner | Tasks: add, edit, complete, uncomplete, delete; times, estimate, category, priority, recurrence (once / daily / weekdays) | Logic implemented (validation, recurrence, completion, set-aside, removal, template-edit planning); UI and persistence spec only | DP-01..DP-07. Deletion follows C1 (suppression list) |
| Planner | My Day: chronological checklist, counts, progress with visible method, calm messages, empty states, plan tomorrow | Spec only | DP-08..DP-11, DP-17 |
| Planner | Progress engine: equal-weight units (0 / 0.5 / 1), zero-task handling, original vs revised plan, immutable plan snapshots | Logic implemented, unit-tested | Section 5 and 14; integer percentage maths; mutation-checked |
| Planner | Remaining effort and "what fits" (only with sufficient estimates) | Logic implemented, unit-tested | DP-11. Partial task uses its full estimate (provisional) |
| Planner | Day modes: Normal, Busy/Festival, Rest; set aside / restore; reschedule with history | Logic implemented, unit-tested | DP-12..DP-16. Partial tasks may be moved (C2 = B). No audit of time-only changes (D6) |
| Planner | Sleep, meals, exercise, hydration as ordinary user-defined tasks (no medical advice, no calorie mechanics) | Spec only | Spec section 3F |
| Planner | History: past-day review, recovery after missed days, weekly summary (no streak counter) | Logic implemented (weekly metrics, snapshots, 7-date edit window); screens and queries spec only | DP-18..DP-20. Days with progress this week; Monday start |
| Planner | Timezone handling (profile timezone, local dates, DST) | Logic implemented; cross-checked against PostgreSQL (PGlite) for 8 zones | Gap resolves forward, overlap to the later instant. Hosted Supabase not tested |
| Planner | Owner-only RLS for planner tables | Spec only | Spec section 8; PGlite tests planned |
| Planner | Challenge / community integration (aggregates only, optional links) | Not started | Spec section 9; deliberately later |
| App | Onboarding (timezone is a prerequisite for the planner) | Not started | See phase plan step 4 |
| App | Real challenge membership, progress, leaderboard | Not started | Phase 5 |
| App | Groups, invitations, privacy-aware sharing | Not started | Phase 5 |
| App | Profile, settings, account deletion | Not started | |
| Quality | Playwright e2e | Not started | Package installed; no specs written |
| Launch | DEPLOYMENT.md, launch checklist | Not started | Phase 6 |
