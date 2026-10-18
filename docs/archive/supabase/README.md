# Archived: the Supabase backend (no longer used)

Arcloop's backend is Django + SQLite (`backend/`). These files are kept only as **historical reference**: they are the specification the Django models and rules were ported from, and `docs/DJANGO_MIGRATION.md` refers to them. Nothing in the application reads, applies or tests them any more.

| File | What it was |
| --- | --- |
| `20261017000000_create_profiles.sql` | `profiles` table, RLS, sign-up trigger. Ported to `backend/accounts` (`Profile`). |
| `20261017100000_create_planner.sql` | Task templates, day plans, task occurrences: constraints, triggers (baseline, original-plan flag, timestamps, caps, suppression clean-up) and RLS (owner-only, 7-date editing window, delete protections). Ported to `backend/planner` (`models.py`, `rules.py`, `resources.py`). |
| `20261018000000_create_reminders.sql` | Reminder preferences and per-task reminders. Ported to `backend/reminders`. |
| `SUPABASE_SETUP.md` | How the Supabase project was to be configured and verified. The hosted project was never created, so none of it was ever run. |

Do **not** apply these to any database as part of Arcloop. They were never applied to a hosted Supabase project.

What was removed with the Supabase code, and where its coverage went, is listed in `docs/DJANGO_MIGRATION.md` ("Removed with Supabase"). The removed files are in the Git history before the commit that deletes them.
