import { isoWeekday, parseDate } from '../../utils/planner/index.js'

// Presentation helpers for the Weekly Overview. All dates are plain 'YYYY-MM-DD' strings and all
// labels are static, so nothing here depends on the browser's timezone or locale.
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const weekdayName = (date) => WEEKDAYS[isoWeekday(date) - 1]
export const weekdayShort = (date) => weekdayName(date).slice(0, 3)

// ISO weekday number (1 = Monday) to its short name, and a list of them to words.
export const weekdayLabel = (n) => WEEKDAYS[n - 1].slice(0, 3)
export const weekdaysSummary = (days) => (days.length === 7 ? 'every day' : days.map(weekdayLabel).join(', '))

export function formatDay(date) {
  const { month, day } = parseDate(date)
  return `${day} ${MONTHS[month - 1]}`
}

export function formatRange(start, end) {
  const a = parseDate(start)
  const b = parseDate(end)
  const left = a.year === b.year ? formatDay(start) : `${formatDay(start)} ${a.year}`
  return `${left} to ${formatDay(end)} ${b.year}`
}

// '07:30', '07:30 to 08:00', or '' when no start time is set.
export const timeRange = (task) => (task.plannedStart ? (task.plannedEnd ? `${task.plannedStart} to ${task.plannedEnd}` : task.plannedStart) : '')

export function formatMinutes(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// One plain-language description per day, so an empty day, a rest day and a day with unfinished
// tasks are always told apart by words (never by colour alone). Calm wording, no judgement.
export function describeDay(entry, { isToday = false } = {}) {
  if (entry.kind === 'no_record') return { label: 'No plan recorded', detail: 'Nothing was planned on this day.', showProgress: false }
  if (entry.kind === 'upcoming') {
    if (entry.isRestDay) return { label: 'Rest day planned', detail: entry.plannedCount ? `${plural(entry.plannedCount, 'task')} kept in the plan` : 'Rest is part of the plan.', showProgress: false }
    if (entry.plannedCount === 0) return { label: 'Nothing planned yet', detail: entry.setAsideCount ? `${entry.setAsideCount} set aside` : 'No tasks yet.', showProgress: false }
    // An unopened today is not over and nothing is recorded yet; it reads like an opened day with no progress.
    return { label: isToday ? 'Not started yet' : 'Planned', detail: `${plural(entry.plannedCount, 'task')} planned`, showProgress: false }
  }
  if (entry.kind === 'rest') {
    return { label: 'Rest day', detail: entry.count > 0 ? `${entry.done} of ${plural(entry.count, 'task')} done` : 'Rest is part of the plan.', showProgress: entry.count > 0 }
  }
  if (entry.kind === 'empty') {
    return { label: 'Nothing planned', detail: entry.setAsideCount ? `${entry.setAsideCount} set aside or moved` : 'No tasks in the plan.', showProgress: false }
  }
  const partial = entry.partial ? `, ${entry.partial} partly done` : ''
  const label = entry.done === entry.count ? 'All done' : entry.units > 0 ? 'In progress' : 'Not started yet'
  return { label, detail: `${entry.done} of ${plural(entry.count, 'task')} done${partial}`, showProgress: true }
}

export const EXCLUDED_LABEL = {
  rescheduled: 'Moved to another day',
  busy_day: 'Set aside for a busy day',
  rest_day: 'Set aside for rest',
  removed: 'Removed from the plan',
}

export const completionLabel = (completion) => (completion === 1 ? 'Done' : completion === 0.5 ? 'Partly done' : 'Not done yet')
