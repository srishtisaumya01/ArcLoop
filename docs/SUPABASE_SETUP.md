# Supabase setup

Arcloop's auth and database code is written but has **not been run against a real Supabase project** (no credentials were available when it was built). Follow these steps, then use the verification list at the end. Until the environment variables are set, the app runs normally but shows "Accounts are not available right now" on the auth pages and disables their submit buttons.

## 1. Create a project
Create a project at supabase.com. Keep the database password in a password manager; it is never used by this app.

## 2. Frontend environment variables
Copy `.env.example` to `.env` (git-ignored) and set:

| Variable | Where to find it |
| --- | --- |
| `VITE_SUPABASE_URL` | Project Settings -> API -> Project URL |
| `VITE_SUPABASE_ANON_KEY` | Project Settings -> API -> anon (or publishable) key |

Restart `npm run dev` after changing `.env`. On Vercel, add the same two variables in Project Settings -> Environment Variables. **Do not** add the service-role/secret key or database password anywhere in this project.

## 3. Apply the database migration
Migrations live in `supabase/migrations/` and must be applied in filename order.

- **Supabase CLI:** `supabase login`, `supabase link --project-ref <ref>`, `supabase db push`.
- **Or the SQL editor:** paste each of the three migration files below into the editor and run them, one at a time, in this order.

Three migrations exist; apply all, in order:
1. `20261017000000_create_profiles.sql` creates `public.profiles`, its triggers, RLS policies and grants, and the sign-up trigger on `auth.users`.
2. `20261017100000_create_planner.sql` creates `task_templates`, `day_plans` and `task_occurrences` with their constraints, triggers, RLS policies and grants. **Requires PostgreSQL 15 or later** (check Project Settings -> Infrastructure). It is additive and does not touch existing data.
3. `20261018000000_create_reminders.sql` creates `reminder_preferences` and `task_reminders` (own-rows-only RLS, column-level grants). Additive; reminders are off until a user turns them on. It only stores settings: delivery happens in the open app (no server scheduler).

None of the migrations has been applied to a real Supabase project yet; all three have only been run in PGlite. After applying them, run the read-only schema check described in section 6 instead of spot-checking by hand.

## 4. Auth settings (Dashboard -> Authentication)
| Setting | Value | Why |
| --- | --- | --- |
| Site URL | your deployed origin, e.g. `https://arcloop.example` (`http://localhost:5173` for local dev) | Base for email links |
| Redirect URLs (allow list) | `<origin>/app` and `<origin>/update-password` for each origin you use, including `http://localhost:5173` | The app sends `emailRedirectTo` / `redirectTo` to these. Supabase rejects URLs not on the list. |
| Email provider -> Confirm email | **On** (recommended) | The sign-up UI handles both settings. With it off, users are signed in immediately. |
| Password minimum length | **8** | Matches the client-side rule in `src/utils/validation.js`. Raise both together. |
| Email templates | Check the "Confirm signup" and "Reset password" templates use `{{ .ConfirmationURL }}` | The app uses the PKCE flow. |
| SMTP | Configure a real SMTP provider before launch | The built-in mailer is rate-limited and for testing only. |

The client uses the **PKCE** flow. A password-reset link must be opened in the **same browser** that requested it (documented in the UI and in KNOWN_ISSUES).

## 5. Verify (manual, against the real project)
1. Sign up with a real inbox. Expect the "Check your inbox" screen, then a confirmation email. Open the link: you should land on `/app` signed in.
2. In the Table Editor, confirm a `profiles` row exists for the new user, with `private` visibility.
3. Log out, log in, reload the page: you should stay signed in.
4. "Forgot your password?" -> open the email link in the same browser -> set a new password -> log in with it.
5. RLS check (SQL editor): `select * from public.profiles;` as the `anon` role should fail with permission denied. With two test users, each should see only their own row through the app.
6. Wrong password shows "Email or password is incorrect."; an unconfirmed account shows the confirm-your-email message.

## 6. Verifying a dedicated TEST project (checklist)

**Disposable test project only. Never production.** You never need to paste a secret anywhere except your own git-ignored `.env`. Never put a service-role or secret key, or the database password, in any `VITE_` variable (those are compiled into the browser bundle); the scripts refuse to run if you do.

### A. One-time setup (about 10 minutes, in the Supabase dashboard)
1. **Create a new, empty project** just for testing (any name, any region; keep the database password in a password manager). It must run **PostgreSQL 15 or later** (check Project Settings > Infrastructure; new projects do).
2. **Turn email confirmation OFF** on this project only: Authentication > Sign In / Providers > **Email** > switch **Confirm email** off > Save. (The wording can differ slightly between dashboard versions.) This lets the script's throw-away users sign up without a mailbox.
3. **Apply the three migrations in the SQL Editor** (no CLI needed). For each file, in this order: SQL Editor > New query > paste the whole file > Run > wait for "Success".
   1. `supabase/migrations/20261017000000_create_profiles.sql`
   2. `supabase/migrations/20261017100000_create_planner.sql`
   3. `supabase/migrations/20261018000000_create_reminders.sql`

   If one fails, **stop**, do not re-run pieces of it, and share the error text (it contains no secrets). The Table Editor should now show 6 tables: `profiles`, `task_templates`, `day_plans`, `task_occurrences`, `reminder_preferences`, `task_reminders`.
4. **Copy the two public values**: Project Settings > API > *Project URL* and the **anon / publishable** key. Never the `service_role` or secret key.
5. **Create `.env`** in the repository root (it is git-ignored): in PowerShell `Copy-Item .env.example .env`, then edit it so it contains:
   ```
   VITE_SUPABASE_URL=https://<your-test-project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<the anon / publishable key>
   ARCLOOP_TEST_PROJECT_REF=<your-test-project-ref>
   ARCLOOP_CONFIRM_TEST_PROJECT=yes
   ```
   The last two are not `VITE_` variables, so they are never bundled. Setting them is your statement that this is a disposable test project.

### B. Preflight (local only, contacts nothing)
```
node --env-file=.env scripts/verify-supabase.mjs --preflight
```
Expected when ready (it prints names and a status only, never values; the ref is shortened):
```
  Node 24.x.x: OK
  VITE_SUPABASE_URL: set
  VITE_SUPABASE_ANON_KEY: set
  ARCLOOP_TEST_PROJECT_REF: set
  ARCLOOP_CONFIRM_TEST_PROJECT: set

Preflight passed. The target would be project abcd… (confirmed by you as a test project).
```
Anything else lists exactly what is missing or still a placeholder, and exits with code 2.

### C. Schema check (read-only)
SQL Editor > paste all of `supabase/verification/schema_checks.sql` > Run. It reads the catalog and changes nothing.

**Expected: 133 rows = 129 PASS, 4 REVIEW, 0 FAIL.** The four REVIEW rows are these helper functions, which have no explicit privilege handling in the migrations. Read the printed `anon` / `authenticated` flags and decide: revoking `EXECUTE` from `anon` is reasonable; do **not** revoke it from `authenticated` without re-testing inserts (a CHECK constraint may need it).
- `public.planner_max_active_templates()`
- `public.planner_max_occurrences_per_day()`
- `public.planner_valid_weekdays(smallint[])`
- `public.reminder_weekdays_valid(smallint[])`

Any FAIL row means the project does not match the migrations. Share that row (check name and detail).

### D. Scripted journey (real sign-in, PostgREST and Row Level Security)
```
node --env-file=.env scripts/verify-supabase.mjs
```
**Expected: 27 lines, all PASS, then `27 passed, 0 failed.` and exit code 0:**

<!-- expected-runner-output -->
```
PASS  sign up two test users and receive sessions
PASS  a wrong password is rejected
PASS  after sign-out the user can read nothing
PASS  signing back in works
PASS  read the current local date from the service
PASS  create a recurring task and a one-off task
PASS  a planned day two days ago is created and left untouched
PASS  coming back is detected after an untouched planned day
PASS  edit a task
PASS  complete one task and partly complete another (75%)
PASS  the "welcome back" condition clears once something is done today
PASS  move a task to tomorrow (original kept, copy linked)
PASS  set a task aside (not counted in progress)
PASS  the Week summary agrees with the day
PASS  Progress shows the recurring task correctly
PASS  editing the recurring task leaves history alone
PASS  ending the recurring task stops it for new days and keeps the records
PASS  data persists across sign-out and sign-in
PASS  reminders: set and remove a task reminder, preferences saved
PASS  another user sees none of this data
PASS  another user cannot read, change or delete this user's rows
PASS  another user cannot create rows that belong to this user
PASS  an anonymous visitor can read and write nothing
PASS  clients cannot write server-owned columns
PASS  days older than the editing window cannot be planned or changed
PASS  finished work cannot be deleted by a client
PASS  clean up what this run created (templates and reminders; history stays by design)
```
<!-- /expected-runner-output -->

A FAIL line is followed by a short, sanitized reason. Share it as is. If sign-up reports that no session was returned, email confirmation is still ON (step A2). The script prints no keys, tokens or passwords.

### E. Cleanup
Finished and moved tasks stay as protected history by design, and the script deliberately has no privileged key, so it cannot delete users. When you are done, delete the two test users it lists at the end (Authentication > Users); their rows cascade. You may delete the whole test project afterwards (Project Settings > General). Do not truncate or reset a project to make anything pass.

### F. The Supabase CLI is optional (not needed for any step above)
It is not installed in the development environment. If you prefer the CLI to the SQL Editor for step A3, the least invasive way is to run it on demand without installing anything globally or changing the project: `npx supabase@latest --version`, then `npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase db push` (it prompts for the database password itself, or reads `SUPABASE_DB_PASSWORD` from your own shell). Global installs (Scoop or a downloaded binary) change machine configuration and are not required.

### G. Not covered by these scripts
The browser UI against real Supabase, the confirm-your-email flow with confirmation ON, email delivery, password-reset links, and load or concurrency. Use the manual list in section 5 for the email flows. The schema check is tested against the migrations in PGlite (`tests/db/schemaChecks.test.js`) and the journey is validated there too (`tests/db/serviceJourney.pglite.test.js`); neither shows how a *hosted* project's default privileges behave, which is exactly what steps C and D are for.

## Local development without a hosted project
`supabase start` (needs Docker and the Supabase CLI) runs a local stack; use the URL and anon key it prints. Neither Docker nor the CLI was available when this phase was built, so that path is untested.
