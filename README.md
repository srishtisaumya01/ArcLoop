# Arcloop

Build habits. Keep growing. A personal growth platform for planning your days, building habits, tracking honest progress, and growing with others (React + Vite + MUI, Supabase Auth + Postgres).

**Core principle: progress, not perfection. A missed day is an event, not an identity. Progress should help people return, not make them feel guilty.**

The foundation feature is the **Daily Planning & Progress Engine**: users build their own daily plans (tasks, recurrence, rest and busy days), see one documented progress calculation, and can revise plans without losing history. It is **specified but not built yet**. See [docs/DAILY_PLANNING_SPEC.md](docs/DAILY_PLANNING_SPEC.md).

## Getting started

```bash
npm install
cp .env.example .env   # add your Supabase project URL + anon key (see docs/SUPABASE_SETUP.md)
npm run dev
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest: unit, component and PGlite database tests (use `npx vitest run --maxWorkers=4` on low memory) |
| `npm run test:e2e` | Playwright in Chromium (desktop 1440 and mobile 390) against the real dev server with an in-memory stand-in for Supabase. Needs `npx playwright install chromium` once. Proves the UI, not a hosted project |

### Known limitations

- There is no offline mode. If the connection drops, pages that are not loaded yet show a calm "This page didn't load" message with a retry; data screens show their error state with retry. Nothing is cached for offline use.
- Reminders are delivered only while Arcloop is open in a browser tab.
- Only Chromium has been run for browser tests. See `docs/KNOWN_ISSUES.md` for the full list.
- Hosted Supabase checks (migrations, schema check, service journey) are documented in `docs/SUPABASE_SETUP.md` and have not been run against a real project.

## Design system

All visual values live in `src/theme/tokens.js` (colors, type scale, spacing, radii, shadows, widths, breakpoints, focus ring, motion). `src/theme/theme.js` maps them onto the MUI theme, including the shared button, card, accordion and focus styles. Components should use theme values rather than hardcoded colors. Font: Plus Jakarta Sans (self-hosted via `@fontsource-variable`).

Sample or illustrative content is kept in `src/constants/landingContent.js` (`DEMO_*`) and must be labelled with `DemoBadge` in the UI.

## Status

- Phase 1 (foundation): complete.
- Phase 2 (design system + landing page): complete.
- Phase 2B (public page layouts): complete. Explore and Challenge details use labelled demo data; login, sign-up and password reset were UI-only layouts (now wired to Supabase in Phase 3); the contact form is still a layout only (nothing is sent or saved); Privacy and Terms are unreviewed drafts. Contact and legal identity details are placeholders in `src/constants/siteConfig.js`.
- Phase 3 (auth + database foundation): code complete, **not yet verified against a real Supabase project**. See [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md). Without credentials the app runs and the auth pages show an "Accounts are not available" notice.
- Daily Planning & Progress Engine: **pure planner logic implemented and unit-tested** in `src/utils/planner/` (progress, recurrence, local dates and DST, rescheduling, day modes, snapshots, weekly metrics). It is **not connected to any UI, database or migration yet**, so users cannot use it. The earlier "habits / habit check-ins" plan is superseded by it.
- Planner database: migration `20261017100000_create_planner.sql` (tasks, day plans, task occurrences, with RLS) is **written and tested in PGlite but not applied to a real Supabase project**. The app's planner screens use it (see below). See `docs/DAILY_PLANNING_SPEC.md` section 15.
- Planner services: `src/services/planner/` (day plans, tasks, templates, completion, rescheduling, day modes, snapshots, weekly summary) is implemented and tested with mocks and in PGlite, but **not run against a real Supabase project**. The signed-in screens (My Day, Week, Recurring Tasks, Progress, Reminders, Settings) are built on it; their tests run against PGlite, not a real backend or a physical device. See `docs/DAILY_PLANNING_SPEC.md` section 16.
- Groups, challenge membership, onboarding, `DEPLOYMENT.md` come in later phases.

See [docs/](docs/): `DAILY_PLANNING_SPEC.md`, `SUPABASE_SETUP.md`, `SECURITY.md`, `PROJECT_STRUCTURE.md`, `FEATURE_TRACKER.md`, `DEVELOPMENT_LOG.md`, `KNOWN_ISSUES.md`.
