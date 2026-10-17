import { compareDates } from './localDates.js'
import { RECURRENCE } from './constants.js'

// Presentation-neutral facts about repeating tasks, for the Recurring Tasks screen. There is no
// "paused" state in the planner (a template is either running or ended), so none is invented here.
//   ended    - archived, or its end date is before today. It adds nothing to new days; the history stays.
//   upcoming - not started yet (starts after today).
//   active   - running today.
export function templateStatus(template, today) {
  if (template.archivedAt) return 'ended'
  if (template.endsOn && compareDates(template.endsOn, today) < 0) return 'ended'
  if (compareDates(template.startsOn, today) > 0) return 'upcoming'
  return 'active'
}

// One-off tasks are stored as one-time templates; they are not "recurring".
export const isRecurringTemplate = (template) => template.recurrence !== RECURRENCE.ONCE

// Recurring templates grouped by status, each group in a stable order (title, then id).
export function groupRecurringTemplates(templates, today) {
  const groups = { active: [], upcoming: [], ended: [] }
  for (const template of templates.filter(isRecurringTemplate)) groups[templateStatus(template, today)].push(template)
  const byTitle = (a, b) => a.title.localeCompare(b.title) || (a.id < b.id ? -1 : 1)
  for (const key of Object.keys(groups)) groups[key].sort(byTitle)
  return groups
}
