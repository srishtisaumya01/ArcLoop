import { RECURRENCE } from './constants.js'
import { ERR, PlannerError } from './errors.js'
import { addDays, compareDates, diffDays, isoWeekday, parseDate } from './localDates.js'

// Recurrence works on local calendar dates only (never instants), so a task on
// "every Monday" lands on the right date on 23- and 25-hour days alike.
// Month ends, year ends and leap days follow from calendar-date arithmetic.

const MAX_RANGE_DAYS = 1000

// Does the template apply on `date`? `endsOn` is inclusive; null = open-ended.
export function occursOn(template, date) {
  parseDate(date)
  if (!template || typeof template !== 'object') {
    throw new PlannerError(ERR.INVALID_TEMPLATE, 'A task template is required.')
  }
  if (compareDates(date, template.startsOn) < 0) return false
  if (template.endsOn != null && compareDates(date, template.endsOn) > 0) return false
  switch (template.recurrence) {
    case RECURRENCE.ONCE:
      return date === template.startsOn
    case RECURRENCE.DAILY:
      return true
    case RECURRENCE.WEEKLY:
      return Array.isArray(template.weekdays) && template.weekdays.includes(isoWeekday(date))
    default:
      throw new PlannerError(ERR.INVALID_TEMPLATE, `Unknown recurrence: ${String(template.recurrence)}`)
  }
}

// Every matching date from `from` to `to` inclusive, ascending, without duplicates.
export function occurrenceDatesBetween(template, from, to) {
  const span = diffDays(from, to)
  if (span < 0) return []
  if (span > MAX_RANGE_DAYS) {
    throw new PlannerError(ERR.INVALID_ARGUMENT, `Date range is too long (more than ${MAX_RANGE_DAYS} days).`)
  }
  const dates = []
  for (let i = 0; i <= span; i += 1) {
    const date = addDays(from, i)
    if (occursOn(template, date)) dates.push(date)
  }
  return dates
}
