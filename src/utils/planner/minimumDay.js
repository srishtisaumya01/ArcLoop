import { ERR, PlannerError } from './errors.js'
import { PLAN_STATES, PLANNER_CONFIG } from './constants.js'
import { resolveContext } from './context.js'
import { assertEditableDate } from './window.js'

// Minimum Day: the few tasks a person chooses to keep a day moving. It is only a label on tasks that are already on the
// day. Nothing here changes completion, plan state, the baseline or any other task, and nothing here feeds the day's
// percentage (progress.js is untouched): the minimum is reported on its own.
// A task is part of the minimum while it is flagged AND still planned; setting it aside takes it out (the server does the
// same and clears the flag).

export const isMinimumTask = (occurrence) => occurrence.isMinimum === true && occurrence.planState === PLAN_STATES.ACTIVE
export const minimumOccurrences = (occurrences) => occurrences.filter(isMinimumTask)

// status: 'none' (no minimum chosen), 'open' (something left to do), 'complete' (every chosen task is done).
// A partly done task is progress, but the minimum is complete only when each chosen task is done.
export function summarizeMinimum(occurrences) {
  const chosen = minimumOccurrences(occurrences)
  const done = chosen.filter((o) => o.completion >= 1).length
  const partial = chosen.filter((o) => o.completion > 0 && o.completion < 1).length
  return {
    count: chosen.length,
    done,
    partial,
    ids: chosen.map((o) => o.id),
    status: chosen.length === 0 ? 'none' : done === chosen.length ? 'complete' : 'open',
  }
}

// Which tasks to flag and which flags to clear so the day's minimum becomes exactly `ids` (an empty list clears it).
// Throws PlannerError for what can never be saved: too many, a repeated id, an unknown or set-aside task, a day that
// cannot be edited. Clears come first when applied, so the day never holds more than the limit part-way.
export function planMinimum({ planDate, occurrences, ids }, rawContext) {
  const ctx = resolveContext(rawContext)
  assertEditableDate(planDate, ctx.today, ctx.config)
  const limit = ctx.config.limits?.minimumTasks ?? PLANNER_CONFIG.limits.minimumTasks
  if (!Array.isArray(ids)) throw new PlannerError(ERR.INVALID_ARGUMENT, 'ids must be a list of task ids')
  if (new Set(ids).size !== ids.length) throw new PlannerError(ERR.INVALID_ARGUMENT, 'A task can only be chosen once.')
  if (ids.length > limit) throw new PlannerError(ERR.INVALID_ARGUMENT, `Choose up to ${limit} tasks for your minimum.`, { limit })
  const byId = new Map(occurrences.map((o) => [o.id, o]))
  for (const id of ids) {
    const task = byId.get(id)
    if (!task) throw new PlannerError(ERR.INVALID_ARGUMENT, 'Choose tasks that are on this day.')
    if (task.planState !== PLAN_STATES.ACTIVE) throw new PlannerError(ERR.NOT_ACTIVE, 'Only a task that is still planned can be part of your minimum.')
  }
  const wanted = new Set(ids)
  const flagged = new Set(minimumOccurrences(occurrences).map((o) => o.id))
  return { clear: [...flagged].filter((id) => !wanted.has(id)), set: ids.filter((id) => !flagged.has(id)) }
}
