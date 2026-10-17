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
- **Or the SQL editor:** paste `supabase/migrations/20261017000000_create_profiles.sql` and run it.

The migration creates `public.profiles`, its triggers, RLS policies and grants, and the sign-up trigger on `auth.users`.

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

## Local development without a hosted project
`supabase start` (needs Docker and the Supabase CLI) runs a local stack; use the URL and anon key it prints. Neither Docker nor the CLI was available when this phase was built, so that path is untested.
