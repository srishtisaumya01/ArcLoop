import { levelOf } from '../../utils/planner/priority.js'
import { durationOf } from './scheduleChecks.js'
import { formatMinutes } from './weekFormat.js'

// A day's load against the time the person has for it, as plain functions of the day's tasks. Nothing here changes a task: the suggestion
// only names tasks that could move, and the person decides.
export const DEFAULT_AVAILABLE_MINUTES = 6 * 60
export const MIN_AVAILABLE_MINUTES = 30
export const MAX_AVAILABLE_MINUTES = 16 * 60
export const AVAILABLE_STEP_MINUTES = 30
const NEARLY_FULL = 0.85 // from this share of the available time the day is called nearly full

export const isAvailableMinutes = (value) =>
  Number.isInteger(value) && value >= MIN_AVAILABLE_MINUTES && value <= MAX_AVAILABLE_MINUTES

// The times offered to choose from, in half hours.
export const AVAILABLE_CHOICES = Array.from(
  { length: (MAX_AVAILABLE_MINUTES - MIN_AVAILABLE_MINUTES) / AVAILABLE_STEP_MINUTES + 1 },
  (_, i) => MIN_AVAILABLE_MINUTES + i * AVAILABLE_STEP_MINUTES,
)

// The time the day's tasks take: every task that is on the day (done ones too, so the figure does not shrink as the day goes), by its block
// or its estimate. `unknown` counts the tasks with neither, which are left out of the sum and said so.
export function dayLoad(tasks) {
  const planned = tasks.filter((t) => t.planState === 'active')
  let minutes = 0
  let unknown = 0
  for (const task of planned) {
    const m = durationOf(task)
    if (m > 0) minutes += m
    else unknown += 1
  }
  return { minutes, unknown, count: planned.length }
}

//   -> { state: 'empty' | 'comfortable' | 'nearly-full' | 'over', minutes, available, over, unknown }
export function capacityStatus({ tasks, availableMinutes }) {
  const { minutes, unknown } = dayLoad(tasks)
  let state = 'comfortable'
  if (minutes === 0) state = 'empty'
  else if (minutes > availableMinutes) state = 'over'
  else if (minutes >= availableMinutes * NEARLY_FULL) state = 'nearly-full'
  return { state, minutes, available: availableMinutes, over: Math.max(0, minutes - availableMinutes), unknown }
}

const RANK = { low: 0, medium: 1 } // lowest priority first; high is never suggested

// Tasks that could move to another day to bring an overloaded day back within the time available: open tasks that are untouched, not
// high priority, not in the Minimum Day and not repeating (a repeating task comes back on its own days). Lowest priority first, then
// the ones without a time (they are the easiest to place elsewhere), then the latest in the day. It stops as soon as enough time would
// be freed; when everything that qualifies would still not be enough, it offers all of it (`enough: false`).
//   -> { tasks, minutes, enough }
export function suggestMoves({ tasks, over, repeatingIds = new Set() }) {
  if (over <= 0) return { tasks: [], minutes: 0, enough: true }
  const candidates = tasks
    .filter((t) => t.planState === 'active' && t.completion === 0 && !t.isMinimum && levelOf(t) !== 'high' && !repeatingIds.has(t.templateId) && durationOf(t) > 0)
    .sort((a, b) =>
      RANK[levelOf(a)] - RANK[levelOf(b)]
      || Number(Boolean(a.plannedStart)) - Number(Boolean(b.plannedStart))
      || (b.plannedStart ?? '').localeCompare(a.plannedStart ?? '')
      || durationOf(b) - durationOf(a)
      || a.id.localeCompare(b.id))
  const picked = []
  let minutes = 0
  for (const task of candidates) {
    if (minutes >= over) break
    picked.push(task)
    minutes += durationOf(task)
  }
  return { tasks: picked, minutes, enough: minutes >= over }
}

// The words for the status line.
export function describeCapacity(status) {
  const { state, minutes, available, over, unknown } = status
  const unknownNote = unknown > 0 ? ` (${unknown} ${unknown === 1 ? 'task has' : 'tasks have'} no time or estimate, so not counted)` : ''
  if (state === 'empty') return unknown > 0 ? `No time is counted yet: ${unknown === 1 ? 'the task has' : 'the tasks have'} no time or estimate.` : 'Nothing is planned yet.'
  const base = `${formatMinutes(minutes)} planned of ${formatMinutes(available)} available`
  if (state === 'over') return `${base}: ${formatMinutes(over)} more than the time you have${unknownNote}.`
  if (state === 'nearly-full') return `${base}: nearly full${unknownNote}.`
  return `${base}${unknownNote}.`
}

// The gentle suggestion for an overloaded day. `nextLabel` is where the tasks would go.
export function describeSuggestion({ suggestion, nextLabel }) {
  if (suggestion.tasks.length === 0) {
    return 'This day holds more than the time you have. Nothing here is an easy one to move, so it is yours to decide: move a task by hand, or change the time you have.'
  }
  const names = suggestion.tasks.map((t) => `“${t.title}”`).join(', ')
  const lead = `This day holds more than the time you have. If you like, you could move ${names} to ${nextLabel}`
  return suggestion.enough ? `${lead}. That would bring it back within your time.` : `${lead}. That would help, though it may still be a full day.`
}

// Something that changes when the finding changes, so a dismissed suggestion comes back only for something new.
export const capacitySignature = (status, suggestion) =>
  JSON.stringify([status.state, Math.round(status.over / 30), suggestion.tasks.map((t) => t.id)])
