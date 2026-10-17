import { DAY_MODES } from './constants.js'
import { ERR, PlannerError } from './errors.js'
import { compareDates, parseDate } from './localDates.js'
import { currentOccurrences, summarizeProgress } from './progress.js'
import { isRecurringTemplate } from './recurringTemplates.js'

// How each repeating task ("habit") has gone over a window of days, from the occurrences that exist.
// A habit is a recurring template and a check-in is an occurrence's completion (spec 15), so this adds
// no stored data. It follows the weekly rules:
//  - only active tasks count; tasks that were moved, set aside or removed are not counted against it;
//  - days marked as rest days are left out (rest is part of the plan);
//  - the window ends today, and today's pending task counts as not done yet;
//  - done = 1, partly done = 0.5, shown with the same percentage rules as a day.
// There is deliberately no streak, no ranking and no "missed" count.
// `days`: [{ planDate, dayMode }] for recorded days; `from` / `to`: inclusive local dates.
export function summarizeHabits({ templates, days, occurrences, from, to }) {
  parseDate(from)
  parseDate(to)
  if (compareDates(from, to) > 0) throw new PlannerError(ERR.INVALID_ARGUMENT, 'The period must end on or after the day it starts.')
  const restDates = new Set(days.filter((d) => d.dayMode === DAY_MODES.REST).map((d) => d.planDate))
  const inWindow = occurrences.filter((o) => compareDates(o.planDate, from) >= 0 && compareDates(o.planDate, to) <= 0 && !restDates.has(o.planDate))

  const habits = []
  for (const template of templates.filter(isRecurringTemplate)) {
    const counted = currentOccurrences(inWindow.filter((o) => o.templateId === template.id))
    if (counted.length === 0) continue // nothing was planned for it in this window
    const { count, units, percent, done, partial, pending } = summarizeProgress(counted)
    habits.push({ templateId: template.id, title: template.title, archived: Boolean(template.archivedAt), planned: count, done, partial, pending, units, percent })
  }
  return habits.sort((a, b) => a.title.localeCompare(b.title) || (a.templateId < b.templateId ? -1 : 1))
}
