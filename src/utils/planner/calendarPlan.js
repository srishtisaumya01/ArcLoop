import { PLANNER_CONFIG } from './constants.js'
import { resolveContext } from './context.js'
import { ERR, PlannerError } from './errors.js'
import { addDays, compareDates, isValidDate } from './localDates.js'
import { sortOccurrencesForDisplay } from './ordering.js'
import { currentOccurrences } from './progress.js'
import { projectDay } from './weekly.js'

// The plan a person can take to a calendar: for each date from `from` to `to`, the tasks the day holds or will hold.
//  - Only today and later are planned. History is a record, not a plan, so earlier dates are left out.
//  - A day that has not happened yet (and today before it has a record) is its existing active tasks plus the repeating
//    tasks that opening it would add: exactly the Week's rule (`projectDay`), so what a calendar receives matches what the
//    Week shows. Today with a record is that record alone (My Day adds repeating tasks to it when it is opened).
//  - Set-aside, moved and removed tasks are not part of the plan. A completed task is: it was still planned for that day.
//  - Within a day, tasks keep the display order; repeating tasks not yet on the day follow.
// `days`: [{ day, occurrences }] for the dates that have a record. `templates`: the user's repeating tasks.
// Returns [{ date, dayMode, tasks }], one entry per date, oldest first.
export function planForRange({ from, to, days = [], templates = [] }, rawContext) {
  const ctx = resolveContext(rawContext)
  const cfg = { ...PLANNER_CONFIG, ...ctx.config }
  if (!isValidDate(from) || !isValidDate(to) || compareDates(from, to) > 0) {
    throw new PlannerError(ERR.INVALID_ARGUMENT, 'Choose a valid range of dates.')
  }
  const first = compareDates(from, ctx.today) < 0 ? ctx.today : from
  const last = compareDates(to, addDays(ctx.today, cfg.planAheadDays)) > 0 ? addDays(ctx.today, cfg.planAheadDays) : to
  const records = new Map(days.map((record) => [record.day.planDate, record]))
  const plan = []
  for (let date = first; compareDates(date, last) <= 0; date = addDays(date, 1)) {
    const record = records.get(date)
    const notYetHappened = compareDates(date, ctx.today) > 0 || (date === ctx.today && !record)
    const { occurrences, expected } = notYetHappened ? projectDay({ date, record, templates }) : { occurrences: record?.occurrences ?? [], expected: [] }
    plan.push({
      date,
      dayMode: record?.day.dayMode ?? 'normal',
      tasks: [...sortOccurrencesForDisplay(currentOccurrences(occurrences)), ...expected],
    })
  }
  return plan
}
