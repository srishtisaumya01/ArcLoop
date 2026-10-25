import { COMPLETION, EXCLUDED_REASONS, PLAN_STATES } from './constants.js'
import { resolveContext } from './context.js'
import { createDay, stampBaseline, unsuppressTemplate } from './dayModes.js'
import { ERR, PlannerError } from './errors.js'
import { parseDate, parseTime } from './localDates.js'
import { planRemoval } from './occurrences.js'
import { SNAPSHOT_FIELDS } from './templates.js'
import { levelOf } from './priority.js'
import { assertEditableDate } from './window.js'

// Rescheduling moves a task to another date WITHOUT rewriting history:
//   - the original occurrence stays on its own date, set aside with reason
//     'rescheduled' (it keeps any progress it had);
//   - a new occurrence on the target date links back through `rescheduledFromId`;
//   - the original-plan and revised-plan figures follow the normal rules: the move
//     removes the task from the source day's revised plan but not from its original plan.
// There is no event table (D6). The link plus the reason is the whole audit trail.
// KNOWN LIMITATION: changing only a task's time within the same day edits it in
// place and is not audited in this version.

function checkTimes(start, end) {
  if (end !== null && start === null) throw new PlannerError(ERR.INVALID_TIME, 'An end time needs a start time.')
  if (start !== null) parseTime(start)
  if (end !== null && parseTime(end) <= parseTime(start)) {
    throw new PlannerError(ERR.INVALID_TIME, 'The end time needs to be after the start time.')
  }
}

// Move `occurrence` to `targetDate`. A partially completed task may be moved (C2 = B):
// its progress stays on the source day and a fresh pending occurrence is created for
// the remainder. A done task cannot be moved.
// `targetDay` may be null when the target day has not been created yet.
// `plannedStart` / `plannedEnd`: undefined keeps the task's times, null clears them.
// Returns { source, sourceDay, target, targetDay, createsTargetDay, link }.
export function rescheduleOccurrence(
  { occurrence, day, targetDate, targetDay = null, occurrencesOnTarget = [], plannedStart, plannedEnd },
  rawContext,
) {
  const ctx = resolveContext(rawContext)
  parseDate(targetDate)
  if (!occurrence.id) throw new PlannerError(ERR.INVALID_ARGUMENT, 'The task needs an id so the move can be linked.')
  if (occurrence.planDate !== day.planDate) throw new PlannerError(ERR.INVALID_STATE, 'The task and the day plan are for different dates.')
  if (targetDate === occurrence.planDate) {
    throw new PlannerError(ERR.INVALID_RESCHEDULE_TARGET, 'Choose a different day to move this task to.')
  }
  assertEditableDate(occurrence.planDate, ctx.today, ctx.config)
  assertEditableDate(targetDate, ctx.today, ctx.config)
  if (targetDay && targetDay.planDate !== targetDate) {
    throw new PlannerError(ERR.INVALID_STATE, 'The target day plan is for a different date.')
  }
  if (occurrence.planState !== PLAN_STATES.ACTIVE) throw new PlannerError(ERR.NOT_ACTIVE, 'This task is already set aside.')
  if (occurrence.completion >= COMPLETION.DONE) {
    throw new PlannerError(ERR.HAS_PROGRESS, 'A finished task stays where it is. Undo it first to move it.')
  }
  if (
    occurrence.templateId &&
    occurrencesOnTarget.some((o) => o.planDate === targetDate && o.templateId === occurrence.templateId)
  ) {
    throw new PlannerError(ERR.ALREADY_PLANNED_ON_TARGET, 'This task is already planned for that day.', { targetDate })
  }

  const start = plannedStart === undefined ? occurrence.plannedStart : plannedStart
  const end = plannedEnd === undefined ? occurrence.plannedEnd : plannedEnd
  checkTimes(start, end)
  const timesChanged = start !== occurrence.plannedStart || end !== occurrence.plannedEnd

  const baseTargetDay = targetDay ?? createDay(targetDate)
  const nextTargetDay = occurrence.templateId ? unsuppressTemplate(baseTargetDay, occurrence.templateId) : baseTargetDay

  const target = {
    templateId: occurrence.templateId,
    planDate: targetDate,
    completion: COMPLETION.PENDING,
    completedAt: null,
    planState: PLAN_STATES.ACTIVE,
    excludedReason: null,
    excludedAt: null,
    rescheduledFromId: occurrence.id,
    inOriginalPlan: baseTargetDay.baselineAt === null,
    isCustomized: occurrence.isCustomized || timesChanged,
  }
  for (const field of SNAPSHOT_FIELDS) target[field] = occurrence[field]
  target.priorityLevel = levelOf(occurrence)
  target.isPriority = target.priorityLevel === 'high'
  target.plannedStart = start
  target.plannedEnd = end

  return {
    source: {
      ...occurrence,
      planState: PLAN_STATES.EXCLUDED,
      excludedReason: EXCLUDED_REASONS.RESCHEDULED,
      excludedAt: ctx.nowIso,
    },
    sourceDay: stampBaseline(day, ctx.nowIso),
    target,
    targetDay: nextTargetDay,
    createsTargetDay: targetDay === null,
    link: { fromId: occurrence.id, fromDate: occurrence.planDate, toDate: targetDate, reason: EXCLUDED_REASONS.RESCHEDULED },
  }
}

// Undo a move: the source goes back into its day's plan and the target is
// removed by the normal removal rules (deleted and suppressed, or soft-removed
// if it belongs to that day's original plan). Refused if progress was recorded
// on the target, or if the target was itself moved on (undo from the last move back).
export function planUndoReschedule({ source, target, targetDay }, rawContext) {
  const ctx = resolveContext(rawContext)
  if (source.planState !== PLAN_STATES.EXCLUDED || source.excludedReason !== EXCLUDED_REASONS.RESCHEDULED) {
    throw new PlannerError(ERR.NOT_EXCLUDED, 'This task was not moved to another day.')
  }
  if (target.rescheduledFromId !== source.id) {
    throw new PlannerError(ERR.INVALID_STATE, 'That task is not the result of this move.')
  }
  if (target.completion > 0) {
    throw new PlannerError(ERR.HAS_PROGRESS, 'Progress was recorded on the new day. Clear it before undoing the move.')
  }
  assertEditableDate(source.planDate, ctx.today, ctx.config)
  const targetResult = planRemoval({ occurrence: target, day: targetDay }, rawContext)
  return {
    source: { ...source, planState: PLAN_STATES.ACTIVE, excludedReason: null, excludedAt: null },
    targetResult,
    targetDay: targetResult.day,
  }
}
