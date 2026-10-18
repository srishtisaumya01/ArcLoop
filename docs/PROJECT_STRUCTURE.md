# Project structure

Frontend: React + Vite (JavaScript/JSX), MUI + Emotion, React Router 7, Lucide icons. Backend: Django 5.2 + Django REST Framework + SQLite (`backend/`).

```
src/
  app/            App.jsx (theme + router provider), router.jsx (lazy routes, route error element)
  components/
    auth/         AuthLayout, TextInput, PasswordField, SubmitButton, FormError, CheckInboxPanel, RouteGuards
    challenges/   ChallengeCard, FeaturedChallengeCard, JoinPanel (prototype), ProgressPreview
    common/       PageHeader, StatePanel (empty/error), PageLoader, RouteError, LegalDocument
    landing/      Landing page sections
    layout/       AppLayout (skip link, scroll handling), Navbar, Footer
    planner/      My Day, Week, Recurring Tasks building blocks (TaskRow, QuickAddTask, AddTaskForm, MinimumDayPanel, TemplateCard, DayCard, ...)
    profile/ reminders/ settings/   TimezonePrompt, ReminderNotifier, settings sections, DeleteAccount
    ui/           Logo, Section/SectionHeading, DemoBadge
  context/        authContext.js, AuthProvider.jsx (session restore, auth-state listener)
  constants/      navigation (ROUTES), demoChallenges (DEMO DATA), landingContent,
                  legalContent (DRAFT text), siteConfig (placeholders), copy for recovery notes and day modes
  hooks/          useAuth, useAsync, useAsyncSubmit, useForm, usePageMeta, useDayPlan, useWeekOverview,
                  useProgressOverview, useRecurringTasks, useRecoveryStatus, useDayReminders, ...
  pages/          public/, auth/, challenges/, app/  (one file per route)
  services/
    api/          apiClient (the one place that knows the API address and holds the session token),
                  djangoClient (a `from(table).select()...` client over the API), queryBuilder
    backend.js    creates the data client once; exports the configuration flag screens read
    authService, profileService, challengeService (still demo data)
    planner/      createPlannerService (all planner operations, injectable client + clock), errors, mappers
    reminders/    createReminderService
  theme/          tokens.js (single source of design values), theme.js (MUI theme)
  utils/          planner/ (pure logic), validation, profile, challengeFilters

backend/
  config/         settings.py (everything environment-specific comes from env vars), errors.py (one error shape),
                  resources.py (the generic user-scoped collection view), middleware.py (API security headers; test-only clock),
                  security_log.py (security events), views.py (health, CSP report), urls.py
  accounts/       Profile, hashed expiring AuthToken, register/login/logout/password/reset/delete endpoints
  planner/        TaskTemplate, DayPlan, TaskOccurrence; rules.py (the ported trigger/RLS rules), resources.py
  reminders/      ReminderPreference, TaskReminder
  tests/          103 Django tests
  accounts/backup.py + management/commands/   backup_db, restore_db, verify_db (SQLite backup, restore, health check)
  planner/management/commands/               writable_fields, tz_samples (cross-checks against the frontend)

tests/
  unit/           Vitest + Testing Library (node-only; no server needed): planner/ (pure logic),
                  plannerService/ (mocked), api/ (client and adapter), screens with mocked services
  integration/    Vitest project that starts a real Django server on a temporary SQLite file: real screens and
                  services against the real API (harness.js, globalSetup.js, user.js)
  support/        queryBuilder (re-export), fakeClient and memoryDb (mocks), serviceJourney, plannerSeed
e2e/              Playwright against the real dev server with an in-memory stub of the API (UI behaviour,
                  loading/empty/error states, pinned clock)
e2e-django/       Playwright against the real Django server and a real SQLite file (cookie auth, CSRF, planner, calendar export, deletion)
e2e-csp/          Playwright: the production build under the enforced Content-Security-Policy (no violations; the policy blocks injected script)
deploy/           securityHeaders.js: the one definition of the frontend security headers (CSP etc.)
scripts/          verify-django.mjs (23-step journey), test-backend.mjs, serve-csp.mjs, print-csp.mjs
docs/             this folder; archive/supabase/ holds the retired Postgres design for reference
```

## Daily Planning & Progress Engine

Pure logic, no UI or network: `src/utils/planner/`, documented in `docs/DAILY_PLANNING_SPEC.md` section 14.

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
  minimumDay.js                       Minimum Day: summary and selection plan (a label; never feeds progress)
  index.js                            re-exports everything
tests/unit/planner/                   unit tests (fixtures.js holds the fixed clock and builders)
```

The server re-enforces the rules that protect data (window, ownership, baseline, caps) in `backend/planner/rules.py`; the client logic decides what to show and what to ask for.

## Routes

| Path | Page | Data |
| --- | --- | --- |
| `/` | Landing | Static copy + labelled sample data |
| `/challenges`, `/challenges/:slug` | Explore, details | Demo data via `challengeService`; join/leave is a UI prototype |
| `/login`, `/signup`, `/forgot-password` | Auth pages (guest-only) | The API via `authService` |
| `/update-password` | Reset-link landing (`?uid=&token=`) and signed-in "change password" | The API |
| `/app` | Signed-in home | Own profile |
| `/app/day`, `/app/week`, `/app/progress`, `/app/recurring`, `/app/reminders`, `/app/settings` | Planner and settings screens | The API via the services |
| `/privacy`, `/terms` | Draft legal pages | Draft text, not reviewed |
| `/contact` | Support | Placeholder details; form does not send |
| `*` | Not found | n/a |

All pages except `/` and the 404 are lazy-loaded (`lazyPage` in `router.jsx`); a page that cannot be loaded shows `RouteError` ("This page didn't load") with a retry.

## Conventions

- Visual values come from `src/theme/tokens.js`; avoid hardcoded colours or spacing in components.
- Sample content must live in `constants/` and be labelled with `DemoBadge` or an explicit notice in the UI.
- Components do not call the API or the client directly: screens use hooks, hooks use `services/`. A test enforces it.
- Read `import.meta.env` variables by static name only (`import.meta.env?.VITE_API_BASE_URL`); a test enforces it.
- Fields used with `useForm` need id `field-<name>` so the first invalid field can be focused.
- Static notices use `Alert` (theme default `role="note"`); only real errors use `role="alert"` (use `FormError`).
