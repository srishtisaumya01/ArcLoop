# Known issues and incomplete work

## Daily Planning & Progress Engine (pure logic implemented; no UI or database)
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
- No e2e tests yet. Playwright is installed and was used for manual verification scripts only; no spec files are committed.
- Browser checks were run on Chromium only (no Firefox/WebKit/Safari).
- Contrast was measured numerically for the main text/background pairs, not exhaustively for every state (hover, disabled).
- MUI text-field focus uses MUI's border highlight rather than the global 3px outline used on links and buttons. It is visible but a different style.
- The landing page FAQ expand animation was confirmed to open and set `aria-expanded`; the animation itself was not reviewed frame by frame.
- Footer "Product" links use hash/route links; "Groups" is a landing-page anchor, not a page.
- Vitest first-import of lazy routes is slow, so tests use a 5 s async timeout and 20 s test timeout (`tests/setup.js`, `vite.config.js`).
- Nothing has been committed to git yet.
