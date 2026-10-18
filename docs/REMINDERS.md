# Reminders: what works, what does not, and the options

## The limitation, stated plainly

**Reminders are delivered only while Arcloop is open in a browser tab.** The page checks every 30 seconds whether a reminder is due (`useReminderScheduler`, `ReminderNotifier`). If the tab is closed, the browser is closed, the device sleeps, or the phone suspends the tab, **nothing is delivered**. A reminder is not replayed if it is more than 2 hours late (provisional), so someone who opens the app at 5 pm does not get a 9 am reminder.

What the app does store and guarantee (verified): reminder preferences and per-task reminders are saved by the server; delivery is *claimed* on the server first (`last_notified_on`, `notified_at`), so the same reminder is not shown twice from two open tabs or after a reload; reminders are off until the person switches them on; a changed time can be delivered again.

What has **not** been verified: real browser notifications (headless Chromium reports permission as denied, so only the in-app notice and the permission wording are tested; the Notification API is stubbed in component tests), behaviour on real phones, and delivery across a device waking from sleep.

The product wording that must stay honest: Settings and the Reminders page already say reminders arrive while Arcloop is open. Do not market this as a background reminder feature.

## Time and timezones

Reminder times are local wall-clock times in the person's profile timezone, evaluated by the page. DST gaps resolve forward and repeated times resolve to the later instant (unit tested: `tests/unit/planner/reminders.test.js`, `timeZones.test.js`). The JS helpers were cross-checked against the server's timezone database on a large sample and one real disagreement was found and fixed (`docs/KNOWN_ISSUES.md`). That is evidence on a sample, not proof that every zone and year is correct.

## Options for real background delivery (not built)

| Option | What it takes | Trade-offs |
| --- | --- | --- |
| **A. Email reminders** | A scheduler on the server (cron running a management command every minute, or a task queue), SMTP, an unsubscribe/consent flow, one email per reminder or a daily digest | Works on every device with no install; slow and noisy; **needs SMTP working and sender-domain setup** (`docs/EMAIL_DECISIONS.md`); email as a reminder channel is easy to ignore; costs per message at scale; fits the existing architecture best (SQLite is enough for a minute-by-minute scan at small scale) |
| **B. Web Push (service worker)** | A service worker, a push subscription stored per device, VAPID keys (secrets), a server process that sends pushes at the right local time (scheduler as in A), permission UX, per-browser testing | The real "notification on my phone" experience; **iOS web push requires the app to be installed to the home screen** and has limits; push endpoints expire and must be pruned; the CSP needs `worker-src 'self'`; a new secret to manage; needs Firefox/WebKit testing, which has not been done; most engineering and operations effort |
| **C. Native app notifications** | A mobile app | Best delivery; a different product with its own stores, review and maintenance: far outside the current scope |
| **D. Calendar export (ICS)** — *implemented as a one-time download, see `CALENDAR_EXPORT.md`; no feed, no email, push or native app in this phase* | Generate `.ics` events for the person's reminders; they subscribe in their calendar app | Delivery handled by software people already trust; no server scheduler or push; but it is a feed to maintain, privacy of a calendar URL (must be an unguessable token), and calendar apps refresh on their own schedule (minutes to hours) |
| **E. Keep as is, be explicit** | Nothing to build | Honest and cheap; useful only to people who keep the app open; some will miss reminders and blame the product |

**Recommendation (a judgement, not a measurement):** for a calm planner whose value is the daily plan, option **E now** (already how it behaves, with honest wording), and if reminders turn out to matter to users, **A or D next**, because they need no per-device permissions and fit the Django/SQLite architecture with one scheduled command; choose **B** only if there is clear demand and the capacity to test it across browsers. Whichever is chosen, it needs its own task: a scheduler (and a health check that it is running), duplicate prevention that works across the scheduler and the open tab, timezone and DST tests for server-side time calculation (the server currently only *stores* times), and a privacy-policy update (the reminder text can reveal a task title to an email provider or push service).

## Decision needed

Which of A to E do you want? Until you choose, nothing in this area changes.
