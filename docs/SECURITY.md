# Security model (Phase 3)

## Principles
- **The database is the authority.** Route guards and hidden buttons only shape the UI. Access control is Row Level Security and column grants in Postgres.
- **The browser only ever holds public configuration.** The anon/publishable key and project URL. The service-role key and database password must never appear in this repo or any `VITE_` variable. `tests/unit/security.test.js` fails the build if client code references them, reads any other env var, or if `.env.example` gains a non-placeholder value.
- **Privacy by default.** New profiles are `private`/`private`, and no policy lets one user read another's profile.

## `public.profiles`

| Operation | anon | authenticated (own row) | authenticated (other user's row) |
| --- | --- | --- | --- |
| SELECT | no privilege (permission denied) | allowed by policy | 0 rows (policy) |
| INSERT | no privilege | no privilege (profile created by trigger) | no privilege |
| UPDATE | no privilege | allowed, only `display_name`, `timezone`, `interests`, `profile_visibility`, `progress_visibility` | 0 rows (policy); `id`, `created_at`, `updated_at` not updatable by anyone |
| DELETE | no privilege | no privilege | no privilege |

- Row removal happens only via `ON DELETE CASCADE` when the auth user is deleted. Account deletion needs a trusted server-side function (Edge Function with the service-role key held server-side) and is **not built yet**.
- Triggers: `handle_new_user` (SECURITY DEFINER, `search_path = ''`, creates the row), `profiles_before_write` (validates the IANA timezone, maintains `updated_at`). `EXECUTE` on both is revoked from clients.
- Constraints: display name 1-60 chars; timezone valid; at most 10 interests, 400 characters total; visibility in (`private`, `public`).
- Cross-user visibility (groups, leaderboards) is deliberately not implemented. When added it must expose only intended columns through a view or function, not widen the table policy.

## Auth
- Supabase Auth with the PKCE flow, session persisted in localStorage by supabase-js, automatic token refresh.
- Error messages shown to users are mapped by code; raw provider text is never displayed.
- Password-reset requests and sign-ups give the same neutral response whether or not the email already has an account (no account enumeration from our UI).
- Logout ends the current device's session (`scope: 'local'`).

## How this was verified
- **Database rules:** `tests/db/profiles.rls.test.js` runs the real migration in PGlite (Postgres compiled to WebAssembly) with stand-ins for Supabase's `anon`/`authenticated` roles, `auth.users` and `auth.uid()`, and checks the table above (19 tests). It uses a stand-in, **not Supabase**. Real behaviour, including PostgREST and default privileges on a hosted project, must be re-checked per `docs/SUPABASE_SETUP.md` step 5.
- **Client behaviour:** unit tests with mocked services, plus a scripted Chromium run against a local mock of the Supabase auth/REST endpoints (see DEVELOPMENT_LOG). The mock is not Supabase.

## Not yet covered
- No security review of a deployed instance, no penetration testing, no rate limiting beyond Supabase's defaults, no MFA, no CAPTCHA, no Content-Security-Policy headers (add at the hosting layer before launch), no audit logging.
- Session tokens in localStorage are readable by any XSS. The app has no known XSS sinks (React escapes output; no `dangerouslySetInnerHTML`), but a CSP is recommended.
