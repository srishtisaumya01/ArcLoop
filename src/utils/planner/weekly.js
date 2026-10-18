import { PLANNER_CONFIG } from './constants.js'
import { resolveContext } from './context.js'
import { ERR, PlannerError } from './errors.js'
import { compareDates, weekDates } from './localDates.js'
import { expectedTaskView, templatesDueOn } from './occurrences.js'
import { sortOccurrencesForDisplay } from './ordering.js'
import { currentOccurrences, remainingOccurrences, setAsideOccurrences, summarizeDay } from './progress.js'

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
//  - Upcoming workload counts what a day WILL hold: its existing active tasks plus the repeating tasks that would
//    be added when it is opened (same rule as opening a day; nothing is created). A task already on the day is
//    never counted twice. Earlier days are never projected: they are what was actually recorded. Today is projected
//    only while it has no record yet (it is not over, and My Day creates its record on the first visit); once today
//    has a record, that record is authoritative and new repeating tasks join it when My Day next opens the day.

const EPSILON = 1e-9

// What the Weekly Overview needs to show each task without re-deriving anything in the UI.
const taskView = (o) => ({
  id: o.id,
  title: o.title,
  completion: o.completion,
  plannedStart: o.plannedStart ?? null,
  plannedEnd: o.plannedEnd ?? null,
  isPriority: Boolean(o.isPriority),
  estimatedMinutes: o.estimatedMinutes ?? null,
  planState: o.planState,
  excludedReason: o.excludedReason ?? null,
})
const usableEstimate = (m) => Number.isInteger(m) && m > 0

// What a day that has not happened yet (a later date, or today before it has a record) will hold: the tasks it already
// has, plus the repeating tasks that opening it would add. Nothing is created. A task already on the day is never counted
// twice, and a hidden (suppressed) or ended repeating task is not projected: it is `templatesDueOn`'s rule, so the Week,
// My Day's preview and the calendar export can never disagree. `record` is `{ day, occurrences }` or undefined.
export function projectDay({ date, record, templates }) {
  const occurrences = record?.occurrences ?? []
  const expected = templatesDueOn({ templates, occurrences, day: record?.day ?? null, planDate: date }).map((t) => expectedTaskView(t, date))
  return { occurrences, expected }
}

const workload = (items) => ({
  plannedCount: items.length,
  estimatedMinutes: items.filter((o) => usableEstimate(o.estimatedMinutes)).reduce((a, o) => a + o.estimatedMinutes, 0),
  missingEstimates: items.filter((o) => !usableEstimate(o.estimatedMinutes)).length,
})

// Task lists and counts for one day. Set-aside, moved and removed tasks are listed apart
// and are never part of "remaining" or "planned".
function dayDetail(occurrences) {
  return {
    tasks: sortOccurrencesForDisplay(currentOccurrences(occurrences)).map(taskView),
    setAside: sortOccurrencesForDisplay(setAsideOccurrences(occurrences)).map(taskView),
    setAsideCount: setAsideOccurrences(occurrences).length,
    remaining: remainingOccurrences(occurrences).length,
  }
}

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
// `templates`: the user's repeating tasks (optional); used only to project days after today.
export function summarizeWeek({ weekOf, days, templates = [] }, rawContext) {
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
    const record = records.get(date)
    const isAfterToday = compareDates(date, ctx.today) > 0
    const isTodayUnopened = date === ctx.today && !record
    if (isAfterToday || isTodayUnopened) {
      // Days that have not happened yet, and today before its record exists: shown as upcoming workload (what the
      // day will hold), never counted in progress.
      const { occurrences, expected } = projectDay({ date, record, templates })
      const detail = dayDetail(occurrences)
      const tasks = [...detail.tasks, ...expected]
      return {
        date,
        kind: 'upcoming',
        dayMode: record?.day.dayMode ?? 'normal',
        isRestDay: record?.day.dayMode === 'rest',
        ...workload(tasks),
        expectedCount: expected.length,
        ...detail,
        tasks,
      }
    }
    if (!record) return { date, kind: 'no_record', dayMode: 'normal', isRestDay: false, tasks: [], setAside: [], setAsideCount: 0, remaining: 0 }
    const s = summarizeDay(record)
    return {
      date,
      kind: s.kind,
      dayMode: record.day.dayMode,
      ...dayDetail(record.occurrences),
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

  // "Coming up" means after today. An unopened today is still today: what it will hold is work remaining today,
  // the same meaning the figure has once the day is opened.
  const upcoming = entries.filter((e) => e.kind === 'upcoming' && compareDates(e.date, ctx.today) > 0)
  const todayUnopened = entries.find((e) => e.kind === 'upcoming' && e.date === ctx.today)

  return {
    weekStart: dates[0],
    weekEnd: dates[6],
    today: ctx.today,
    isCurrentWeek: compareDates(ctx.today, dates[0]) >= 0 && compareDates(ctx.today, dates[6]) <= 0,
    days: entries,
    daysWithPlan,
    daysWithProgress: counted.filter((e) => e.units > 0).length,
    restDays: entries.filter((e) => e.kind === 'rest').length,
    plannedDays: planned.length,
    tasksDone: counted.reduce((sum, e) => sum + e.done, 0),
    tasksPartial: counted.reduce((sum, e) => sum + e.partial, 0),
    // Still to do on days that have happened (active tasks that are not done). Set-aside tasks are not counted.
    tasksRemaining: counted.reduce((sum, e) => sum + e.remaining, 0) + (todayUnopened?.plannedCount ?? 0),
    // Upcoming workload: planned tasks on days that have not happened yet (never counted in progress).
    upcomingTasks: upcoming.reduce((sum, e) => sum + e.plannedCount, 0),
    upcomingEstimatedMinutes: upcoming.reduce((sum, e) => sum + e.estimatedMinutes, 0),
    upcomingMissingEstimates: upcoming.reduce((sum, e) => sum + e.missingEstimates, 0),
    averagePercent: averagePercent(planned),
    eligible: daysWithPlan >= cfg.minPlannedDaysForWeeklySummary,
  }
}
