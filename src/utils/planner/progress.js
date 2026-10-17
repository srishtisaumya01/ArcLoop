import { COMPLETION_VALUES, DAY_MODES, PLAN_STATES } from './constants.js'
import { ERR, PlannerError } from './errors.js'

// Progress is always computed from occurrences, never stored (spec section 5).
// Equal weighting; completion units: pending 0, partial 0.5, done 1 (D1).
// Arithmetic is done in integer "halves" so percentages never suffer float error.

export function isValidCompletion(value) {
  return COMPLETION_VALUES.includes(value)
}

export function assertCompletion(value) {
  if (!isValidCompletion(value)) {
    throw new PlannerError(ERR.INVALID_COMPLETION, `Completion must be 0, 0.5 or 1 (received ${String(value)}).`)
  }
  return value
}

// Whole-number percentage for `units` completed out of `count` tasks, or null
// when there are no tasks (never 0%, never NaN). Display rules:
//   - rounded half up;
//   - 100 only when every task is fully complete (a near miss is capped at 99);
//   - any progress above zero shows at least 1.
export function percentFromUnits(units, count) {
  if (!Number.isInteger(count) || count < 0) {
    throw new PlannerError(ERR.INVALID_ARGUMENT, 'Task count must be a whole number of zero or more.')
  }
  if (count === 0) return null
  const halves = units * 2
  if (!Number.isInteger(halves) || halves < 0 || halves > 2 * count) {
    throw new PlannerError(ERR.INVALID_ARGUMENT, 'Units must be a multiple of 0.5 between 0 and the task count.')
  }
  if (halves === 2 * count) return 100
  // 100 * units / count == 50 * halves / count; add one half before flooring.
  let percent = Math.floor((100 * halves + count) / (2 * count))
  if (percent >= 100) percent = 99
  if (halves > 0 && percent < 1) percent = 1
  return percent
}

export const currentOccurrences = (occurrences) => occurrences.filter((o) => o.planState === PLAN_STATES.ACTIVE)
export const originalOccurrences = (occurrences) => occurrences.filter((o) => o.inOriginalPlan === true)
export const setAsideOccurrences = (occurrences) => occurrences.filter((o) => o.planState === PLAN_STATES.EXCLUDED)
export const addedAfterBaseline = (occurrences) => occurrences.filter((o) => o.inOriginalPlan === false)
// Not finished yet (a partially completed task still counts as remaining).
export const remainingOccurrences = (occurrences) =>
  currentOccurrences(occurrences).filter((o) => o.completion < 1)

// { count, units, percent, done, partial, pending } for any list of occurrences.
export function summarizeProgress(occurrences) {
  let halves = 0
  let done = 0
  let partial = 0
  let pending = 0
  for (const o of occurrences) {
    assertCompletion(o.completion)
    halves += o.completion * 2
    if (o.completion === 1) done += 1
    else if (o.completion === 0.5) partial += 1
    else pending += 1
  }
  const count = occurrences.length
  const units = halves / 2
  return { count, units, percent: percentFromUnits(units, count), done, partial, pending }
}

// Has the day's plan been revised? Revisions are: any task set aside, any task
// added after the baseline, or a day mode other than Normal. The original-plan
// figure is only shown for revised days (spec 5.3).
export function isPlanRevised(day, occurrences) {
  return (
    day.dayMode !== DAY_MODES.NORMAL ||
    occurrences.some((o) => o.planState === PLAN_STATES.EXCLUDED || o.inOriginalPlan === false)
  )
}

// Everything My Day needs about one day's progress.
//   kind: 'rest'    day mode is Rest (shown explicitly; excluded from averages);
//         'empty'   no active tasks and not a rest day (percent is null);
//         'planned' at least one active task.
//   current: the revised/current plan (active tasks only).
//   original: the baseline plan (every task in it, whatever its state), or null
//             when the plan has not been revised.
export function summarizeDay({ day, occurrences }) {
  const current = summarizeProgress(currentOccurrences(occurrences))
  const revised = isPlanRevised(day, occurrences)
  const isRestDay = day.dayMode === DAY_MODES.REST
  return {
    planDate: day.planDate,
    dayMode: day.dayMode,
    isRestDay,
    kind: isRestDay ? 'rest' : current.count === 0 ? 'empty' : 'planned',
    revised,
    current,
    original: revised ? summarizeProgress(originalOccurrences(occurrences)) : null,
    remainingCount: remainingOccurrences(occurrences).length,
    setAsideCount: setAsideOccurrences(occurrences).length,
  }
}
