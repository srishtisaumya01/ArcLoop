import { MONDAY } from './constants.js'
import { ERR, PlannerError } from './errors.js'

// Local calendar dates are plain 'YYYY-MM-DD' strings with no timezone. All
// arithmetic goes through UTC calendar fields, which have no daylight saving,
// so "tomorrow" is always exactly one calendar day later whatever the local
// day length. Nothing here uses 24-hour millisecond steps on local dates.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/
const MIN_YEAR = 1000
const MAX_YEAR = 9999
const MS_PER_DAY = 86400000

export function parseDate(value) {
  const match = typeof value === 'string' ? DATE_RE.exec(value) : null
  if (!match) throw new PlannerError(ERR.INVALID_DATE, `Invalid date: ${String(value)}`)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const check = new Date(Date.UTC(year, month - 1, day))
  // Round-trip so impossible dates (2026-02-30, 2100-02-29) are rejected.
  const real =
    year >= MIN_YEAR &&
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
  if (!real) throw new PlannerError(ERR.INVALID_DATE, `Invalid date: ${value}`)
  return { year, month, day }
}

export function isValidDate(value) {
  try {
    parseDate(value)
    return true
  } catch {
    return false
  }
}

const pad = (n, width) => String(n).padStart(width, '0')
const formatUtc = (d) => `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`
const toUtcMs = (value) => {
  const { year, month, day } = parseDate(value)
  return Date.UTC(year, month - 1, day)
}

export function addDays(date, days) {
  if (!Number.isInteger(days)) throw new PlannerError(ERR.INVALID_ARGUMENT, 'addDays needs an integer number of days.')
  const d = new Date(toUtcMs(date))
  d.setUTCDate(d.getUTCDate() + days)
  if (d.getUTCFullYear() > MAX_YEAR || d.getUTCFullYear() < MIN_YEAR) {
    throw new PlannerError(ERR.INVALID_DATE, `Date out of supported range: ${date} + ${days} days`)
  }
  return formatUtc(d)
}

// Whole calendar days from `from` to `to` (negative if `to` is earlier).
export function diffDays(from, to) {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY)
}

export function compareDates(a, b) {
  const diff = toUtcMs(a) - toUtcMs(b)
  return diff === 0 ? 0 : diff < 0 ? -1 : 1
}

// ISO weekday: 1 = Monday ... 7 = Sunday.
export function isoWeekday(date) {
  return new Date(toUtcMs(date)).getUTCDay() || 7
}

export function startOfWeek(date, weekStartsOn = MONDAY) {
  if (!Number.isInteger(weekStartsOn) || weekStartsOn < 1 || weekStartsOn > 7) {
    throw new PlannerError(ERR.INVALID_ARGUMENT, 'weekStartsOn must be an ISO weekday from 1 to 7.')
  }
  const offset = (isoWeekday(date) - weekStartsOn + 7) % 7
  return addDays(date, -offset)
}

// The seven dates of the week containing `date`, first day first.
export function weekDates(date, weekStartsOn = MONDAY) {
  const start = startOfWeek(date, weekStartsOn)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

// 'HH:MM' (24-hour, no seconds) -> minutes after midnight.
export function parseTime(value) {
  const match = typeof value === 'string' ? TIME_RE.exec(value) : null
  if (!match) throw new PlannerError(ERR.INVALID_TIME, `Invalid time: ${String(value)}`)
  return Number(match[1]) * 60 + Number(match[2])
}

export function isValidTime(value) {
  try {
    parseTime(value)
    return true
  } catch {
    return false
  }
}
