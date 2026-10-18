# Security model

Arcloop's backend is the Django API in `backend/`. The earlier Supabase design (Row Level Security in Postgres) is archived in `docs/archive/supabase/`; the same rules are now enforced in Python, and tested there.

## Principles

- **The server is the authority.** Route guards and hidden buttons only shape the UI. Every request to a data endpoint needs a valid bearer token, and every query starts from the signed-in user's own rows (`Resource.scope(user)` in `backend/config/resources.py`). A filter, an id or a `user_id` in a request cannot reach another user's data.
- **The browser holds only a public address and its own session token.** `VITE_API_BASE_URL` is the only variable the bundle reads, and it is read by static name so the bundler cannot inline the whole environment. The Django secret key and the mail password live only in the API's environment. `tests/unit/security.test.js` fails if client code references secret-like names, reads any other variable or the whole environment object, if `.env.example` gains a real value, or if the API settings hold a literal secret.
- **Privacy by default.** New profiles are `private`/`private`, and no endpoint returns another user's data.

## Authentication

- Register, login, logout, password change, password reset and account deletion are `backend/accounts`.
- A sign-in is an opaque random token sent as `Authorization: Bearer ...`. Only its SHA-256 is stored, so a database leak does not leak working sign-ins. Tokens expire (30 days by default), are revoked on logout, and all of a user's tokens are revoked on password reset and account deletion (other devices on password change). Unknown, expired and deactivated-user tokens all answer the same 401.
- The token is stored by the browser in `localStorage` and sent in a header, never a cookie: there is no CSRF surface, and CORS needs no credentials. The cost: any script injected into the page can read the token. The app has no known XSS sinks (React escapes output; no `dangerouslySetInnerHTML`), but a Content-Security-Policy at the host is required before launch (`docs/DEPLOYMENT.md`).
- Passwords use Django's hashers and validators (minimum 8 characters, not too common, not all numeric, not too similar to the email).
- Login failures are identical for a wrong password and an unknown email. Password-reset requests answer the same whether or not the address has an account (no enumeration through reset). Registering an existing email says an account may already exist; that does reveal existence, a deliberate usability trade-off.
- Public auth endpoints are rate limited (30 per minute per client address by default, configurable).
- Reset links are Django's signed, single-use tokens: they stop working once the password changes, and expire.
- Registering signs the user in at once. There is **no email confirmation**: anyone can register any address. Decide before launch (see `docs/DEPLOYMENT.md`).

## Authorisation (what Postgres RLS and triggers used to do)

Tested in `backend/tests/test_planner.py` (`IsolationTests` and others):

| Rule | Where |
| --- | --- |
| Owner-only access on every table; filters, ids and `user_id` cannot cross users | `config/resources.py` |
| A client cannot write `user_id` (other than its own), ids, timestamps, `in_original_plan`, `baseline_at`, `completed_at`, `excluded_at` (refused with 403, not ignored) | `Resource.read_input` |
| A new occurrence's template, source task and day must be the caller's own | `planner/resources.py` |
| Days older than today minus 6 (in the user's timezone) are read-only history; days more than 366 ahead cannot be created | `planner/rules.py` |
| The baseline is fixed once and never changes; the first progress, set-aside, Busy or Rest fixes it | `planner/resources.py` |
| Progress cannot be recorded for a future date | `planner/resources.py` |
| Hard delete only for untouched tasks, never an original-plan task once the baseline exists; days are never deleted by a client | `planner/resources.py` |
| Abuse caps: 200 active templates, 100 tasks a day, 200 hidden templates (provisional) | `planner/rules.py` |
| Reminders: one preference row per user; whole-minute times; the date of a task reminder comes from the task; delivery is claimed once | `reminders/resources.py` |

## Account deletion

`POST /api/v1/auth/account/delete/` deletes the signed-in account and, in one transaction, everything it owns (profile, tokens, templates, day plans, occurrences, reminders). It requires the account password again (a stolen token alone cannot do it) and the typed word `DELETE`; both are checked by the server whatever the client did. Staff and superuser accounts are refused (manage them in the admin). The account to delete is always the caller's; nothing in the body can name another. A repeat request finds no session (401), and the email can be registered afresh. It is rate limited with the other auth endpoints. Backups taken earlier still hold the data until they expire (`docs/DEPLOYMENT.md`).

## Errors

Every failure is `{"error": {"code", "message", "fields"?}}`. Messages are written for people; no SQL, stack traces, table names or credentials are returned. Unhandled exceptions return a generic 500 and are logged server-side only. The client turns them into `PlannerServiceError` or `AuthServiceError` with calm wording.

## CORS

Only the origins in `CORS_ALLOWED_ORIGINS` may call the API from a browser; credentials are not allowed. Proven in the browser suite for the test origin and for a hostile one.

## How this was verified

- **Backend:** 63 Django tests (`npm run test:backend`): sign-in and tokens, profile, every planner rule above, reminders, cross-user isolation, error shape, account deletion, the test-clock switch.
- **Frontend and server together:** `npm run verify:django` (23 steps through the real services and a real server), the integration project (97 tests: real screens and services against a real server), and `npm run test:e2e:django` (30 real-browser tests: sign-up, sign-in, logout, reset by emailed link, CORS, a planner journey, persistence after reload, two users, deletion).
- **Not covered:** no penetration test, no deployed instance, no MFA, no CAPTCHA, no account lockout beyond rate limiting, no audit log, no Content-Security-Policy or HSTS configured at a host, no monitoring. See `docs/DEPLOYMENT.md` for the blocker list.
