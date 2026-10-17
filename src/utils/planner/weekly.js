import { PLANNER_CONFIG } from './constants.js'
import { resolveContext } from './context.js'
import { ERR, PlannerError } from './errors.js'
import { compareDates, weekDates } from './localDates.js'
import { summarizeDay } from './progress.js'

// Weekly metrics (D8, D9, D12). There is deliberately NO streak anywhere here.
//  - Weeks run Monday to Sunday in the user's local calendar.
//  - A day "with progress" has active tasks whose completion units sum to more than 0.
//    Rest-day progress is visible and counts toward this.
//  - Rest days are shown explicitly and never enter the average.
//  - The average is the arithmetic mean of the (unrounded) daily completion
//    percentages over planned, non-rest days. Days with no record, empty days, rest
//    days and days that have not happened yet are not counted as 0.
//  - A summary is "eligible" once at least N days have a plan (planned or rest). That is
//    a different number from the days with progress.
//  - Only days up to and including today count; planned-ahead days are 'upcoming'.

const EPSILON = 1e-9

// Mean of daily fractions as a whole percent, with the same display rules as a day
// (100 only if every day is complete; at least 1 if there is any progress).
function averagePercent(plannedDays) {
  if (plannedDays.length === 0) return null
  const meanFraction = plannedDays.reduce((sum, d) => sum + d.units / d.count, 0) / plannedDays.length
  const allComplete = plannedDays.every((d) => d.units === d.count)
  const anyProgress = plannedDays.some((d) => d.units > 0)
  let percent = Math.floor(meanFraction * 100 + 0.5 + EPSILON)
  if (allComplete) return 100
  if (percent >= 100) percent = 99
  if (anyProgress && percent < 1) percent = 1
  return percent
}

// `days`: [{ day, occurrences }] for the dates that have a record. Missing dates are 'no_record'.
export function summarizeWeek({ weekOf, days }, rawContext) {
  const ctx = resolveContext(rawContext)
  const cfg = { ...PLANNER_CONFIG, ...ctx.config }
  const dates = weekDates(weekOf ?? ctx.today, cfg.weekStartsOn)
  const records = new Map()
  for (const record of days) {
    if (records.has(record.day.planDate)) {
      throw new PlannerError(ERR.INVALID_ARGUMENT, `Two plans were given for ${record.day.planDate}.`)
    }
    records.set(record.day.planDate, record)
  }

  const entries = dates.map((date) => {
    if (compareDates(date, ctx.today) > 0) return { date, kind: 'upcoming' }
    const record = records.get(date)
    if (!record) return { date, kind: 'no_record' }
    const s = summarizeDay(record)
    return {
      date,
      kind: s.kind,
      isRestDay: s.isRestDay,
      revised: s.revised,
      percent: s.current.percent,
      units: s.current.units,
      count: s.current.count,
      done: s.current.done,
      partial: s.current.partial,
      pending: s.current.pending,
    }
  })

  const counted = entries.filter((e) => e.kind === 'planned' || e.kind === 'rest' || e.kind === 'empty')
  const planned = entries.filter((e) => e.kind === 'planned')
  const daysWithPlan = entries.filter((e) => e.kind === 'planned' || e.kind === 'rest').length

  return {
    weekStart: dates[0],
    weekEnd: dates[6],
    days: entries,
    daysWithPlan,
    daysWithProgress: counted.filter((e) => e.units > 0).length,
    restDays: entries.filter((e) => e.kind === 'rest').length,
    plannedDays: planned.length,
    tasksDone: counted.reduce((sum, e) => sum + e.done, 0),
    tasksPartial: counted.reduce((sum, e) => sum + e.partial, 0),
    averagePercent: averagePercent(planned),
    eligible: daysWithPlan >= cfg.minPlannedDaysForWeeklySummary,
  }
}
