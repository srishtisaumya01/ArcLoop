# Calendar export (.ics)

Reminders in Arcloop are delivered only while the app is open (`docs/REMINDERS.md`). The calendar export is the first step for people who want their plan somewhere that works when Arcloop is closed: it downloads a standard `.ics` file of the upcoming plan that any calendar app can import. **It adds no email, web push or native functionality.**

**What it is not:** an exported event is a *request* to a calendar app. Whether that app shows the event, shows an alert, or notifies anyone is the app's decision. **Arcloop cannot and does not guarantee a notification**, and the screen says so. Nothing in this repository tested a real calendar app (Google, Apple, Outlook): files were read back with an independent parser (see "How it was verified").

## Using it

Reminders page → **Add to a calendar**. Choose how many days (7, 14 or 30; the plan-ahead limit is 30), whether tasks **without a time** become all-day events (off by default), and an optional **alert** (none by default; at the start, or 5, 10, 15, 30, 60 minutes before; timed events only). Download, then import the file in the calendar app.

## What is in the file

- **One event per task per day, from today.** History is a record, not a plan, so earlier dates are never exported. Set-aside, moved and removed tasks are not part of the plan and are not exported; a task already done today still is (it was planned). A repeating task is written out **day by day**, including days not opened yet, using the same rule as the Week and My Day preview (`projectDay` in `src/utils/planner/weekly.js`: started, not ended, not hidden for that day, not already on it), so what a calendar receives matches what the Week shows.
- **Timed tasks as UTC instants** (`DTSTART:20260310T130000Z`). The instant is the task's local time on that local date in the person's **Arcloop** timezone, using the planner's rules everywhere (a time a clock change skips is placed forward; a time that happens twice is placed at the later one). The file has **no time-zone definitions**, so every app places the event at the same moment and shows it in the viewer's own zone. If the viewer's calendar is in a different zone from their Arcloop profile, the event appears at the same *moment*, in the calendar's local time.
- **End:** the planned end if there is one, otherwise start + estimate; with neither, **no end** (nothing is invented). An end that would not be after the start (it can happen around a skipped or repeated hour) is dropped.
- **Untimed tasks** (only if asked) are all-day events on their local date, marked as not blocking time. They never get an alert.
- **Alerts** only if asked, only on timed events, as a display alert (`VALARM`) the chosen minutes before the start.
- **Text:** title, notes, category, priority (`PRIORITY:1`), the estimate, and a line saying it came from Arcloop and does not update. Text is escaped per RFC 5545 and long lines are folded at 75 octets without splitting a character.
- **Stable event IDs** (`UID`): a repeating task's event on a date has the same ID whether or not that day has been opened yet; one-off tasks use their own ID. Apps that match on IDs replace an event when the file is imported again; **some apps add copies instead**, which the screen says.

### Why separate events, and UTC, not recurrence rules and time zones

A repeating rule (`RRULE`) must carry one wall-clock time through daylight-saving changes in a named zone. That needs a `VTIMEZONE` definition inside the file and is interpreted differently by different calendar apps, and the rule cannot express "this one was moved" or "set aside today" without extra override entries. Separate events with UTC instants cannot drift and need no definitions. The cost: the file is a **snapshot** (it does not stay in sync, and a long horizon makes a larger file).

## Privacy

The file is created **in the browser** and saved on the device; only the request that reads the plan goes to the server. It contains task titles and notes: keep it private, and be careful where it is shared or synced.

## How it was verified (and what was not)

Verified (Chromium and Node; an independent parser, `ical.js`, reads every file back):
- Unit (68 tests in the calendar files): escaping, folding by octets with multi-byte text and emoji, UTC formats; event contents; **11 time zones** for the same wall time including half-hour and 45-minute offsets and both sides of the date line; times near local midnight landing on the right UTC date; **spring-forward gap and fall-back overlap**; a daily task across New York's March and November changes; Lord Howe's half-hour shift; weekly and once tasks, inclusive end dates, tasks not started yet; set-aside/moved/removed excluded; hidden repeating tasks; untimed handling; alerts off by default and refused when not on offer; stable and unique IDs; deterministic order and bytes; an empty plan is a valid calendar.
- Integration (11 tests, real service and real server): a realistic week with a **moved** task (appears on its new day at its own time), a **set-aside** task (absent), a one-off, a repeating task and an untimed one; exporting creates nothing; one person never sees another's tasks; a local-midnight boundary (23:59:59 vs 00:00:00); Auckland vs New York "today" for a weekly Monday task; a person across the date line; DST in both directions through the real service.
- Browser, stubbed API (8 tests, desktop and mobile): the **actual downloaded file** for the seeded plan, options, honest wording, fits the screen.
- Browser, real server (4 tests, desktop and mobile): a timed task made in the real My Day form for an `Asia/Kolkata` profile exports at 03:30 UTC; a repeating task in `Pacific/Auckland` is exported on seven local days at the right offsets; another signed-in person gets an empty calendar.
- Browser under the enforced Content-Security-Policy: the download works with no violation.

**Not verified:** import into any real calendar application; how apps treat the `UID`s on re-import; whether any app shows the alerts; behaviour on phones' calendar apps or with large files; time zones and years beyond those listed (chosen cases, not proof); Firefox and Safari downloads.

## Limits and ideas not built

- A snapshot, not a feed: no subscription URL (a feed would need a secret per-person URL, server-side generation and its own privacy and security design, and calendar apps refresh feeds on their own schedule, from minutes to a day).
- Maximum 30 days (the plan-ahead limit).
- No per-category filtering, no export of past days, no checklist/`VTODO` export.
