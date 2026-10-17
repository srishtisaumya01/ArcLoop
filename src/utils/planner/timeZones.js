import { ERR, PlannerError } from './errors.js'
import { addDays, parseDate, parseTime } from './localDates.js'

// Timezone handling on top of Intl, with explicit semantics for daylight saving:
//   - a local time that does NOT exist (spring-forward gap) resolves FORWARD;
//   - an AMBIGUOUS local time (fall-back overlap) resolves to the LATER instant.
// These match PostgreSQL's `timestamp AT TIME ZONE` for the cases covered by
// tests/db/planner.timezones.test.js. Runtime behaviour is verified there, not assumed.

const formatterCache = new Map()
function formatter(timeZone) {
  let f = formatterCache.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatterCache.set(timeZone, f)
  }
  return f
}

// Canonical, case-sensitive IANA-style names only. The database matches names
// exactly (pg_timezone_names), so 'utc' or 'america/new_york' must be rejected.
// Chrome reports 'Asia/Calcutta' and Firefox 'Asia/Kolkata' for the same zone,
// so Intl's own canonical form cannot be used as the test. Instead:
//   1. every '/'-separated segment starts with a capital letter;
//   2. Intl accepts the name;
//   3. if Intl resolves it to the same name ignoring case, the case must match.
// Limit: a legacy alias with wrong inner capitalisation (e.g. 'Asia/KolKata')
// cannot be detected in JavaScript; the database check is authoritative.
export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || timeZone === '' || timeZone !== timeZone.trim()) return false
  if (!timeZone.split('/').every((segment) => /^[A-Z]/.test(segment))) return false
  let resolved
  try {
    resolved = new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions().timeZone
  } catch {
    return false
  }
  if (resolved.toLowerCase() === timeZone.toLowerCase()) return resolved === timeZone
  return true
}

export function assertTimeZone(timeZone) {
  if (!isValidTimeZone(timeZone)) {
    throw new PlannerError(ERR.INVALID_TIME_ZONE, `Invalid time zone: ${String(timeZone)}`)
  }
  return timeZone
}

// Accepts a Date, epoch milliseconds, or an ISO-8601 string.
export function toInstantMs(value) {
  const ms = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : value
  if (typeof ms !== 'number' || !Number.isFinite(ms)) {
    throw new PlannerError(ERR.INVALID_INSTANT, `Invalid instant: ${String(value)}`)
  }
  return ms
}

function wallClock(ms, timeZone) {
  const parts = {}
  for (const { type, value } of formatter(timeZone).formatToParts(new Date(ms))) parts[type] = Number(value)
  return parts
}

// Offset of `timeZone` from UTC at an instant, in seconds (east positive).
function offsetSeconds(ms, timeZone) {
  const p = wallClock(ms, timeZone)
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((wall - Math.floor(ms / 1000) * 1000) / 1000)
}

// The local calendar date ('YYYY-MM-DD') at an instant, in the given zone.
export function localDateOf(now, timeZone) {
  assertTimeZone(timeZone)
  const p = wallClock(toInstantMs(now), timeZone)
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

const DAY_MS = 86400000

// Local date + 'HH:MM' -> epoch ms, applying the gap/overlap rules above.
export function zonedDateTimeToInstant(date, time, timeZone) {
  assertTimeZone(timeZone)
  const { year, month, day } = parseDate(date)
  const minutes = parseTime(time)
  const wall = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60)
  // Offsets either side of the wall time cover any single transition nearby.
  const before = offsetSeconds(wall - DAY_MS, timeZone)
  const after = offsetSeconds(wall + DAY_MS, timeZone)
  const valid = [...new Set([before, after])]
    .map((offset) => ({ offset, instant: wall - offset * 1000 }))
    .filter(({ offset, instant }) => offsetSeconds(instant, timeZone) === offset)
  if (valid.length === 0) return wall - before * 1000 // gap: resolve forward
  return Math.max(...valid.map((v) => v.instant)) // overlap: later instant
}

// First instant of a local date (usually 00:00; later if midnight does not exist).
export function startOfLocalDay(date, timeZone) {
  return zonedDateTimeToInstant(date, '00:00', timeZone)
}

// Real length of a local day in minutes: 1380 / 1440 / 1500 around DST changes.
export function localDayLengthMinutes(date, timeZone) {
  return Math.round((startOfLocalDay(addDays(date, 1), timeZone) - startOfLocalDay(date, timeZone)) / 60000)
}

// Whole minutes from `now` to the start of the next local day, measured in real
// elapsed time (so a 23- or 25-hour day is handled), never negative.
export function minutesUntilEndOfLocalDay(now, timeZone) {
  const nowMs = toInstantMs(now)
  const nextStart = startOfLocalDay(addDays(localDateOf(nowMs, timeZone), 1), timeZone)
  return Math.max(0, Math.floor((nextStart - nowMs) / 60000))
}

// Has the planned wall-clock time on `date` already passed at `now`?
export function hasLocalTimePassed(now, date, time, timeZone) {
  return toInstantMs(now) >= zonedDateTimeToInstant(date, time, timeZone)
}
