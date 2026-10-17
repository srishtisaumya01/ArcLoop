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
| `npm test` | Vitest unit/component tests |

## Design system

All visual values live in `src/theme/tokens.js` (colors, type scale, spacing, radii, shadows, widths, breakpoints, focus ring, motion). `src/theme/theme.js` maps them onto the MUI theme, including the shared button, card, accordion and focus styles. Components should use theme values rather than hardcoded colors. Font: Plus Jakarta Sans (self-hosted via `@fontsource-variable`).

Sample or illustrative content is kept in `src/constants/landingContent.js` (`DEMO_*`) and must be labelled with `DemoBadge` in the UI.

## Status

- Phase 1 (foundation): complete.
- Phase 2 (design system + landing page): complete.
- Phase 2B (public page layouts): complete. Explore and Challenge details use labelled demo data; login, sign-up and password reset were UI-only layouts (now wired to Supabase in Phase 3); the contact form is still a layout only (nothing is sent or saved); Privacy and Terms are unreviewed drafts. Contact and legal identity details are placeholders in `src/constants/siteConfig.js`.
- Phase 3 (auth + database foundation): code complete, **not yet verified against a real Supabase project**. See [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md). Without credentials the app runs and the auth pages show an "Accounts are not available" notice.
- Daily Planning & Progress Engine: **pure planner logic implemented and unit-tested** in `src/utils/planner/` (progress, recurrence, local dates and DST, rescheduling, day modes, snapshots, weekly metrics). It is **not connected to any UI, database or migration yet**, so users cannot use it. The earlier "habits / habit check-ins" plan is superseded by it.
- Groups, challenge membership, onboarding, `DEPLOYMENT.md` come in later phases.

See [docs/](docs/): `DAILY_PLANNING_SPEC.md`, `SUPABASE_SETUP.md`, `SECURITY.md`, `PROJECT_STRUCTURE.md`, `FEATURE_TRACKER.md`, `DEVELOPMENT_LOG.md`, `KNOWN_ISSUES.md`.
