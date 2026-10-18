# Email decisions: sign-up confirmation, password-reset delivery

Nothing here changes behaviour. Registering still signs the user in immediately (decided earlier, unchanged). No SMTP provider is chosen, no credential is entered, and **no real email has ever been sent** by this project: development prints to the API console, tests write files.

## 1. Decision (recorded): sign in at once for the private beta; revisit before sharing features

**Decided:** registration keeps signing the person in immediately; no mandatory email confirmation yet. Reminders stay in-app and calendar export is the priority (`CALENDAR_EXPORT.md`); no email delivery, web push or native app in this phase. Revisit confirmation before adding anything shared between users or opening sign-up publicly. **Requirement for later:** verified email is mandatory before shared features, invitations, groups or public sign-up (reasons and the build list: `AUTH_SECURITY.md` section 6). Not built in this phase; no SMTP credentials were added and no email was sent. The analysis below still applies.


| | Immediate sign-in (today) | Confirm the address first |
| --- | --- | --- |
| Friction | Lowest: a person is planning within seconds. Matches the product's "calm, no friction" tone | A step before first use; some people never come back from the inbox (spam folders, delays) |
| Typo in the email | Account is created for a wrong address; **password reset can never reach the person** (they are locked out for good if they forget the password) | Caught immediately: the confirmation never arrives, nothing is created or it stays unusable |
| Someone registers **another person's** address | Possible: the real owner later finds an account under their address (and registering with it is refused: "an account may already exist"). Can be used to annoy, squat, or to attach someone's email to content they control | Prevented: the account stays inactive until the owner confirms |
| Spam / bulk fake accounts | Easy (only rate limiting stands in the way) | Slows them (needs working inboxes), not stops them |
| Account recovery | Works only if the address was right | Guaranteed: the address is proven to receive mail |
| Email deliverability dependency | Only for password reset | For **every** new account: if mail is broken, nobody can sign up |
| Privacy | Fewer emails sent | One more email per sign-up |
| Engineering | Done | Not built: needs an `is_active`/verified flag, a confirmation token and email, a rule in login, a resend limit, an expiry, UI states, tests, and a decision on what to do with unconfirmed accounts (delete after N days?) |
| Operations | | Needs SMTP working **before** launch, monitored |

**Recommendation (a judgement, not a test result):** for a personal planner with no sharing yet and no content visible to other people, immediate sign-in is defensible **for a private beta**, provided password reset works (see section 3). Require confirmation **before** adding anything that exposes one person's data or identity to another (groups, challenges, leaderboards, invitations), and before any public launch. Either way, decide it explicitly; do not drift.

## 2. SMTP: configuration and how to verify (all steps need your authorisation first)

I have not chosen a provider and will not without your say. When you do, the required configuration is **environment variables on the API host only** (see `backend/.env.example`):

```
DJANGO_EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend   # the default when DJANGO_DEBUG is off
DJANGO_EMAIL_HOST=smtp.your-provider.example
DJANGO_EMAIL_PORT=587
DJANGO_EMAIL_USE_TLS=true            # or DJANGO_EMAIL_USE_SSL=true with port 465
DJANGO_EMAIL_HOST_USER=...           # from the provider
DJANGO_EMAIL_HOST_PASSWORD=...       # from the provider; never in Git, never in a VITE_ variable
DJANGO_FROM_EMAIL="Arcloop <no-reply@your-domain.example>"
FRONTEND_URL=https://app.your-domain.example     # the reset link points here
```

Before the first real send:

1. **Sender domain:** publish SPF and DKIM for the sending domain (and DMARC); otherwise reset emails are likely to land in spam or be rejected. Use a real, monitored `From` address.
2. **Use a test mailbox you control**, not a real user. Request a reset for it from the deployed app.
3. **Check:** the email arrives within a minute; the link starts with your `FRONTEND_URL`, is `https`, opens the "Choose a new password" page, works once, stops working after use, and stops working after one hour (`DJANGO_PASSWORD_RESET_TIMEOUT`).
4. **Check the headers** (view original): SPF/DKIM/DMARC pass.
5. **Check failure behaviour:** with a deliberately wrong SMTP password the reset request still answers the same 204 for real and unknown addresses (a send failure used to return a 500 only for real accounts, which would have revealed which addresses exist; fixed and tested), and the API log shows `event=reset_email_failed error=<ExceptionType>` (never the message, address or credentials). **Alert on that log line**: while it appears, nobody can reset a password and the person is told nothing.
6. **Rotate** the SMTP credential if it was ever pasted into chat, a ticket or a terminal.

Verification that has been done without sending anything: the reset flow end to end with the file backend, including the link, single use, expiry (`PASSWORD_RESET_TIMEOUT`), wrong/forged links, and that the log never contains the address, token or link (`backend/tests/test_security.py`, `e2e-django/auth.spec.js`).

## 3. Reset delivery risks to accept or fix before launch

- **Deliverability:** a reset email that does not arrive is a locked-out user. Monitor bounces and provide a support address (`SITE_CONFIG.supportEmail` is empty on purpose).
- **Timing:** a request for a real account takes longer (it sends mail) than for an unknown one. Sending in a background task would hide the difference; not built.
- **Enumeration:** registration says an address may already exist; reset and login do not.
- **Account takeover through the mailbox:** whoever controls the mailbox controls the account; there is no second factor.
