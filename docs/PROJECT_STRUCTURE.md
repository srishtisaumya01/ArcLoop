# Project structure

React + Vite (JavaScript/JSX), MUI + Emotion, React Router 7, Lucide icons. No backend yet.

```
src/
  app/            App.jsx (theme + router provider), router.jsx (lazy routes)
  components/
    auth/         AuthLayout, TextInput, PasswordField, SubmitButton, FormError, CheckInboxPanel, RouteGuards
    challenges/   ChallengeCard, FeaturedChallengeCard, JoinPanel (prototype), ProgressPreview
    common/       PageHeader, StatePanel (empty/error), PageLoader, LegalDocument
    landing/      Landing page sections
    layout/       AppLayout (skip link, scroll handling), Navbar, Footer
    ui/           Logo, Section/SectionHeading, DemoBadge
  context/        authContext.js, AuthProvider.jsx (session restore, auth-state listener)
  constants/      navigation (ROUTES), demoChallenges (DEMO DATA), landingContent,
                  legalContent (DRAFT text), siteConfig (placeholders)
  hooks/          useAuth, useAsync, useAsyncSubmit, useForm, usePageMeta, usePrototypeSubmit (contact form only)
  pages/          public/, auth/, challenges/  (one file per route)
  services/       supabaseClient (only place the client is created), authService, profileService,
                  challengeService (still demo data)
  services/planner/  createPlannerService (factory: all planner operations, injectable client + clock),
                     errors (PlannerServiceError, SERVICE_ERROR), mappers (rows <-> domain, writable columns),
                     index (wired to the shared client). Not used by any UI yet
  theme/          tokens.js (single source of design values), theme.js (MUI theme)
  utils/          validation, challengeFilters
tests/unit/       Vitest + Testing Library; planner/ (pure logic), plannerService/ (MOCKED service tests)
tests/support/    test helpers: queryBuilder, fakeClient, memoryDb (mocks), pgliteSupabase (adapter that runs
                  service queries as SQL in PGlite under the real RLS; not PostgREST)
supabase/         migrations/ (SQL, applied in filename order): create_profiles, create_planner; functions/ (empty)
tests/db/         SQL/RLS tests run in PGlite (harness.js stubs Supabase roles/auth.uid and can fix the clock);
                  profiles.rls, planner.schema, planner.rls, migrations.hygiene, planner.timezones; plannerSeed.js helpers
docs/             this folder
```

## Daily Planning & Progress Engine

**Built (pure logic, no UI or database):** `src/utils/planner/`, documented in `docs/DAILY_PLANNING_SPEC.md` section 14.

```
src/utils/planner/
  constants.js errors.js context.js   vocabulary, PLANNER_CONFIG, PlannerError, { now, timeZone } context
  localDates.js timeZones.js          calendar dates, canonical timezones, DST-aware conversion
  window.js                           7-date editing window + plan-ahead limit
  recurrence.js templates.js          once / daily / weekly, validation, template-edit planning
  progress.js ordering.js             units, percentages, current vs original, display order
  occurrences.js reschedule.js        top-up, complete, set aside, remove (C1), move / undo move (C2)
  dayModes.js snapshots.js            day state and modes, baseline, immutable snapshots
  weekly.js workload.js               Monday-Sunday metrics, remaining effort and fit
  index.js                            re-exports everything
tests/unit/planner/                   unit tests (fixtures.js holds the fixed clock and builders)
tests/db/planner.timezones.test.js    JS vs PostgreSQL (PGlite) timezone cross-check
```

**Planned, NOT built.** Proposed locations only; none of these files exist:

```
src/constants/           plannerCopy (approved neutral messages), plannerCategories (suggestions)
src/services/            taskService, dayPlanService (all database access; no direct calls from components)
src/hooks/               useDayPlan (load/ensure a day, mutate tasks, refresh)
src/components/planner/  TaskRow, TaskForm, DayModeSelector, ProgressSummary, SetAsideList
src/pages/app/           MyDayPage, MyGrowthPage (history, weekly summary)
supabase/migrations/     task_templates, day_plans, task_occurrences (+ triggers, RLS)
tests/db/                planner RLS/constraint tests in PGlite
```

## Routes

| Path | Page | Data |
| --- | --- | --- |
| `/` | Landing | Static copy + labelled sample data |
| `/challenges` | Explore challenges | Demo data via `challengeService` |
| `/challenges/:slug` | Challenge details | Demo data; join/leave is a UI prototype |
| `/login`, `/signup`, `/forgot-password` | Auth pages (guest-only: signed-in users are redirected) | Supabase Auth via `authService` |
| `/update-password` | Password-reset email landing; also "change password" | Needs a session from the email link |
| `/app` | Signed-in home (requires auth) | Reads own profile via RLS |
| `/privacy`, `/terms` | Draft legal pages | Draft text, not reviewed |
| `/contact` | Support | Placeholder contact details; form does not send |
| `*` | Not found | n/a |

All pages except `/` and the 404 are lazy-loaded (`lazyPage` in `router.jsx`).

## Conventions

- Visual values come from `src/theme/tokens.js`; avoid hardcoded colours or spacing in components.
- Sample content must live in `constants/` and be labelled with `DemoBadge` or an explicit notice in the UI.
- Components do not import demo constants for listing/detail data; they call `services/` so Phase 5 can swap the implementation.
- Fields used with `useForm` need id `field-<name>` so the first invalid field can be focused.
- Static notices use `Alert` (theme default `role="note"`); only real errors use `role="alert"`.
