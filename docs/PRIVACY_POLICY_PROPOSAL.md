# Privacy policy: review of the current draft and a proposed update

**This is a proposal, not legal advice and not a published policy. It does not claim compliance with GDPR, UK GDPR, CCPA/CPRA, India's DPDP Act, children's-privacy rules or any other law.** It has not been reviewed by a lawyer. Nothing here has been added to the website: the live draft is `src/constants/legalContent.js` (labelled as an unreviewed draft). Owner and a qualified reviewer decide what is published.

## 1. Review: what the current draft says and what is missing

| Draft section | Problem | What is now true in the code (verified) |
| --- | --- | --- |
| Information handled | Lists "Habits, goals and check-ins", "Challenge and group memberships". Those do not exist | Stored today: email, password hash, display name, timezone, interests (stored, not editable), visibility settings, tasks and repeating tasks (titles, descriptions, categories, times, estimates), day plans (day type), progress per task, set-aside and move history, reminder settings and per-task reminder times, sign-in tokens (hashed), security logs (client address, event type) |
| Use | Mentions challenges and groups | Used to run the planner, reminders and progress views; security logging |
| Sharing | Says visibility is controlled by settings, "must be verified" | **Nothing is shared between users today**: visibility settings are saved but do nothing yet |
| Service providers | "Arcloop is planned to use third-party providers for authentication, database hosting..." | Authentication and data are Arcloop's own server and SQLite database. **Providers still unknown:** hosting, email (SMTP) for password resets, backup storage |
| **Retention and deletion** | "will be described here once those features are implemented" | **Account deletion exists** (password + typed DELETE; removes the account and everything it owns from the live database in one step; ends all sessions). Backups, logs and retention are undecided |
| **Backups** | Not mentioned | Backups are planned (`docs/BACKUP_RESTORE.md`): they contain all personal data and survive deletion until they expire |
| **Restoration** | Not mentioned | A restore can bring back an account that was deleted after the backup was taken |
| Security | Generic | See section 3: facts that can be stated honestly, and ones that cannot |
| Technical information | "Basic technical information" | Server logs hold the client address and event type for failed sign-ins, rate limiting, registrations, resets, deletions and browser security-policy reports; they never hold passwords, tokens, reset links or email addresses |
| Children | "not decided" | Still undecided (needs a product decision first) |
| Rights | "after legal review" | Needs the places Arcloop is offered to be decided first |
| Cookies / storage | Not mentioned | The app stores a **sign-in token and basic account details in the browser's local storage** (necessary for the service), and small per-browser preferences (dismissed notices). No analytics, no tracking, no advertising cookies in the code |
| Email | Not mentioned | Emails are sent only for password reset (when configured); none are sent for marketing |

Sensitive content: task text can contain health, family, religion, location or other sensitive details, and people choose what to write. The policy should say so plainly and say Arcloop does not ask for or analyse it.

## 2. Proposed wording (to be reviewed; bracketed items are decisions or facts the owner must supply)

**Who we are.** {{legalEntityName}} runs Arcloop. Contact: {{supportEmail}}. [Postal address, registration number, and a privacy contact or representative if the law of the places you offer the service requires one.]

**What we collect.**
- *Account:* your email address and a password (we store only a one-way hash of it), your display name if you add one, and your timezone.
- *Your plans:* the tasks, repeating tasks, notes, categories, times and estimates you enter; which day type you choose; what you mark done or partly done; what you set aside or move; and your reminder settings and reminder times. This is the content of the service. You decide what to write, and some of it may be sensitive. We do not ask for health, family or other sensitive information, and we do not analyse your content.
- *Technical:* a sign-in token (stored hashed on our server and in your browser), and security logs of events such as failed sign-ins, with the network address they came from. We do not put passwords, tokens, reset links or email addresses in these logs.
- We do not use advertising or analytics trackers, and we do not sell your information.

**What stays on your device.** To keep you signed in, your browser stores a sign-in token and basic account details in local storage, plus small preferences such as notices you dismissed. Signing out removes the token.

**How we use it.** To provide Arcloop (your plans, progress, reminders), to keep it secure and working (including detecting abuse), and to email you a password-reset link when you ask. Nothing you enter is shown to other people: [update if sharing features are added].

**Who processes it for us.** [List each provider once chosen: hosting and where the servers are; email delivery for password resets; backup storage. Say what each receives (for email: your address and the reset link).]

**Keeping your information.** We keep your account and plans until you delete your account. *Deleting your account:* in Settings, choose "Delete account", enter your password and type DELETE. This permanently removes your account and everything in it from our live systems straight away and signs you out everywhere. *Backups:* we keep backups to recover from failures, [daily/weekly/monthly, held for X days]. Deleted information remains in backups until they expire, then is erased with them; backups are encrypted and access-restricted. *If we ever have to restore a backup,* we re-apply deletions made since it was taken so that deleted accounts do not return. *Logs* are kept for [N] days. [Any legal retention.]

**Security.** Passwords are stored hashed; sign-in tokens are stored hashed; connections use HTTPS [once deployed]; access to the database and backups is limited to [who]. No online service can promise perfect security; if we learn of a breach affecting you we will tell you [and the authority where required, within the time the law requires].

**Your choices and rights.** You can change your name, timezone and settings in Settings, and delete your account there. [Rights to access, correct, export, object or complain, and how to exercise them, depend on the law that applies; write after legal review. Note: there is **no data export feature yet**: do not promise one.]

**Children.** [Minimum age: decision needed.]

**Changes.** We will update this page and the date when this changes[, and tell you about material changes].

## 3. Statements that must not be made until true

- "End-to-end encrypted", "we cannot read your data": false; the operator can read the database.
- "Your data is deleted immediately everywhere": backups keep it until they expire.
- "We comply with GDPR/CCPA...": not claimed or established.
- "Reminders are delivered to your phone": they are delivered only while the app is open (`docs/REMINDERS.md`).
- "Verified email address": addresses are not confirmed at sign-up (`docs/EMAIL_DECISIONS.md`).
- "Data export": not built.

## 4. Decisions needed before this can be finalised

1. Backup frequency, retention period and log retention (they appear in the policy).
2. Providers and locations (hosting, email, backup storage).
3. Where the service is offered (decides which rights and notices apply) and the minimum age.
4. Whether a data-export feature will be built (and by when) or the policy will say it is not offered.
5. Whether email confirmation will be required.
6. A qualified review of the final text.
