import { addDays, zonedDateTimeToInstant } from '../planner/index.js'
import { contentLine, escapeText, formatDate, formatUtc, serialize } from './icsText.js'

// A plan (`getCalendarPlan`) as an iCalendar file that calendar apps can import.
//
// What is written, and why:
//  - One event per task per day. A repeating task is written out day by day rather than as a recurrence rule: a rule has to
//    carry one wall-clock time through daylight-saving changes in a named zone, which needs a time-zone definition inside the
//    file and is read differently by different apps; separate events cannot drift. (Cost: the file is a snapshot.)
//  - A timed task is written as the INSTANT its local time is on that date in the person's Arcloop timezone (UTC, with the
//    `Z` suffix), so every app places it at the right moment and shows it in the viewer's own zone. The same local-time rules
//    the planner uses everywhere apply: a time that does not exist (a clock change skipping it) resolves forward, one that
//    happens twice resolves to the later instant.
//  - An untimed task is an all-day event, only if the person asks for those.
//  - Alerts are only written if asked for, and only for timed events. An alert is a REQUEST to the calendar app: it decides
//    whether and how to notify. Arcloop cannot guarantee that a notification appears.
//  - UIDs are stable (a repeating task's event on a date is the same event whether or not that day has been opened), so apps
//    that match on them update an event instead of duplicating it when the file is imported again. Not every app does.

const PRODUCT = '-//Arcloop//Plan export//EN'
export const ALERT_CHOICES = [null, 0, 5, 10, 15, 30, 60] // minutes before the start; null = no alert; 0 = at the start
export const EXPORT_DAYS_CHOICES = [7, 14, 30]

// A task with a time, as { start, end } instants; `end` is only given when it is known.
function timedSpan(task, date, timeZone) {
  const start = zonedDateTimeToInstant(date, task.plannedStart, timeZone)
  let end = null
  if (task.plannedEnd) end = zonedDateTimeToInstant(date, task.plannedEnd, timeZone)
  else if (Number.isInteger(task.estimatedMinutes) && task.estimatedMinutes > 0) end = start + task.estimatedMinutes * 60000
  return { start, end: end !== null && end > start ? end : null } // a repeated or skipped hour must never produce an end before the start
}

const uidOf = (task, date) => `${task.templateId ? `t-${task.templateId}-${date}` : `o-${task.id}`}@arcloop`

function descriptionOf(task) {
  return [task.description, task.estimatedMinutes ? `Estimate: ${task.estimatedMinutes} min` : null, 'From your Arcloop plan. Changes in Arcloop do not update this event.']
    .filter(Boolean)
    .join('\n')
}

function eventLines({ task, date, timeZone, stamp, alertMinutes }) {
  const lines = ['BEGIN:VEVENT', contentLine('UID', uidOf(task, date)), contentLine('DTSTAMP', stamp)]
  let sortKey
  if (task.plannedStart) {
    const { start, end } = timedSpan(task, date, timeZone)
    sortKey = start
    lines.push(contentLine('DTSTART', formatUtc(start)))
    if (end !== null) lines.push(contentLine('DTEND', formatUtc(end)))
  } else {
    sortKey = zonedDateTimeToInstant(date, '00:00', timeZone)
    lines.push(contentLine('DTSTART', formatDate(date), { VALUE: 'DATE' }), contentLine('DTEND', formatDate(addDays(date, 1)), { VALUE: 'DATE' }), 'TRANSP:TRANSPARENT')
  }
  lines.push(contentLine('SUMMARY', escapeText(task.title)), contentLine('DESCRIPTION', escapeText(descriptionOf(task))))
  if (task.category) lines.push(contentLine('CATEGORIES', escapeText(task.category)))
  if (task.isPriority) lines.push('PRIORITY:1')
  if (task.plannedStart && alertMinutes !== null) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', contentLine('DESCRIPTION', escapeText(task.title)), contentLine('TRIGGER', alertMinutes === 0 ? 'PT0S' : `-PT${alertMinutes}M`), 'END:VALARM')
  }
  lines.push('END:VEVENT')
  return { sortKey, uid: uidOf(task, date), lines }
}

// `plan`: what getCalendarPlan returns. `now`: the instant the file is made (DTSTAMP). Returns the file's text and counts
// so the screen can say exactly what was and was not included.
export function buildPlanCalendar({ plan, options = {}, now }) {
  const { includeUntimed = false, alertMinutes = null } = options
  if (alertMinutes !== null && !ALERT_CHOICES.includes(alertMinutes)) throw new RangeError('Choose one of the offered alert times.')
  const stamp = formatUtc(now)
  const events = []
  let untimedLeftOut = 0
  for (const { date, tasks } of plan.days) {
    for (const task of tasks) {
      if (!task.plannedStart && !includeUntimed) {
        untimedLeftOut += 1
        continue
      }
      events.push(eventLines({ task, date, timeZone: plan.timeZone, stamp, alertMinutes }))
    }
  }
  events.sort((a, b) => a.sortKey - b.sortKey || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0)) // a stable order, so the same plan always gives the same file
  const text = serialize([
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    contentLine('PRODID', PRODUCT),
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    contentLine('X-WR-CALNAME', 'Arcloop plan'),
    ...events.flatMap((event) => event.lines),
    'END:VCALENDAR',
  ])
  return { text, eventCount: events.length, untimedLeftOut, from: plan.from, to: plan.to, timeZone: plan.timeZone, filename: `arcloop-plan-${plan.from}-to-${plan.to}.ics` }
}
