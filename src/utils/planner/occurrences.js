import { COMPLETION, EXCLUDED_REASONS, PLAN_STATES } from './constants.js'
import { resolveContext } from './context.js'
import { stampBaseline, suppressTemplate } from './dayModes.js'
import { ERR, PlannerError } from './errors.js'
import { occursOn } from './recurrence.js'
import { SNAPSHOT_FIELDS } from './templates.js'
import { assertCompletion } from './progress.js'
import { assertCanRecordProgress, assertEditableDate } from './window.js'

// Occurrence = one task on one local date, holding its own snapshot of the
// task details plus completion and plan state. Shape:
//   { id, templateId, planDate, title, description, category, isPriority,
//     plannedStart, plannedEnd, estimatedMinutes, completion, completedAt,
//     planState, excludedReason, excludedAt, rescheduledFromId,
//     inOriginalPlan, isCustomized, createdAt }
// Functions never mutate their arguments and take time via `{ now, timeZone }`.

function assertSameDay(occurrence, day) {
  if (occurrence.planDate !== day.planDate) {
    throw new PlannerError(ERR.INVALID_STATE, 'The task and the day plan are for different dates.', {
      occurrenceDate: occurrence.planDate,
      dayDate: day.planDate,
    })
  }
}

// New occurrence (no id: the database assigns it) copied from a template.
// Whether it belongs to the original plan depends on whether the day has a baseline.
export function createOccurrenceDraft(template, planDate, day) {
  const draft = {
    templateId: template.id ?? null,
    planDate,
    completion: COMPLETION.PENDING,
    completedAt: null,
    planState: PLAN_STATES.ACTIVE,
    excludedReason: null,
    excludedAt: null,
    rescheduledFromId: null,
    inOriginalPlan: day.baselineAt === null,
    isCustomized: false,
  }
  for (const field of SNAPSHOT_FIELDS) draft[field] = template[field] ?? null
  draft.isPriority = Boolean(template.isPriority)
  return draft
}

// The "top-up" run when a day is opened (D10, C1). Returns drafts for templates
// that match `planDate`, have no occurrence on it yet, and are not on the day's
// suppression list. Days older than the 7-date window can never be created (D5).
// Deterministic: drafts follow the order of `templates`.
export function occurrencesToCreate({ templates, occurrences, day, planDate }, rawContext) {
  const ctx = resolveContext(rawContext)
  assertEditableDate(planDate, ctx.today, ctx.config)
  if (day.planDate !== planDate) throw new PlannerError(ERR.INVALID_STATE, 'The day plan is for a different date.')
  const present = new Set(occurrences.filter((o) => o.planDate === planDate && o.templateId).map((o) => o.templateId))
  const suppressed = new Set(day.suppressedTemplateIds)
  return templates
    .filter((t) => occursOn(t, planDate) && !present.has(t.id) && !suppressed.has(t.id))
    .map((t) => createOccurrenceDraft(t, planDate, day))
}

// Record 0, 0.5 or 1. Returns { occurrence, day, changed, restored }.
//  - Recording any progress fixes the day's baseline (once).
//  - Raising completion on a set-aside task puts it back in the current plan, because
//    the user did the work. A task moved to another date must first have the move undone.
//  - Progress can only be recorded for today or earlier, inside the 7-date window.
export function setCompletion({ occurrence, day, value }, rawContext) {
  assertCompletion(value)
  const ctx = resolveContext(rawContext)
  assertSameDay(occurrence, day)
  assertCanRecordProgress(occurrence.planDate, ctx.today, ctx.config)
  if (value === occurrence.completion) return { occurrence, day, changed: false, restored: false }

  let next = { ...occurrence, completion: value, completedAt: value > 0 ? ctx.nowIso : null }
  let restored = false
  if (occurrence.planState === PLAN_STATES.EXCLUDED && value > occurrence.completion) {
    if (occurrence.excludedReason === EXCLUDED_REASONS.RESCHEDULED) {
      throw new PlannerError(
        ERR.REQUIRES_UNDO_RESCHEDULE,
        'This task was moved to another day. Undo the move before recording progress here.',
      )
    }
    next = { ...next, planState: PLAN_STATES.ACTIVE, excludedReason: null, excludedAt: null }
    restored = true
  }
  return { occurrence: next, day: value > 0 ? stampBaseline(day, ctx.nowIso) : day, changed: true, restored }
}

// Set a task aside for a Busy or Rest day. Partially completed tasks may be set
// aside (C2 = B); done tasks may not. The first set-aside fixes the baseline.
export function setAside({ occurrence, day, reason }, rawContext) {
  if (reason !== EXCLUDED_REASONS.BUSY_DAY && reason !== EXCLUDED_REASONS.REST_DAY) {
    throw new PlannerError(ERR.INVALID_ARGUMENT, 'Set aside needs a busy-day or rest-day reason.')
  }
  const ctx = resolveContext(rawContext)
  assertSameDay(occurrence, day)
  assertEditableDate(occurrence.planDate, ctx.today, ctx.config)
  if (occurrence.planState !== PLAN_STATES.ACTIVE) {
    throw new PlannerError(ERR.NOT_ACTIVE, 'This task is already set aside.')
  }
  if (occurrence.completion >= COMPLETION.DONE) {
    throw new PlannerError(ERR.HAS_PROGRESS, 'A finished task stays in the plan. Undo it first if you want to set it aside.')
  }
  return {
    occurrence: { ...occurrence, planState: PLAN_STATES.EXCLUDED, excludedReason: reason, excludedAt: ctx.nowIso },
    day: stampBaseline(day, ctx.nowIso),
  }
}

// Bring a set-aside task back into the current plan. Moved tasks need the move undone first.
export function restoreOccurrence({ occurrence }, rawContext) {
  const ctx = resolveContext(rawContext)
  assertEditableDate(occurrence.planDate, ctx.today, ctx.config)
  if (occurrence.planState !== PLAN_STATES.EXCLUDED) {
    throw new PlannerError(ERR.NOT_EXCLUDED, 'This task is already in the plan.')
  }
  if (occurrence.excludedReason === EXCLUDED_REASONS.RESCHEDULED) {
    throw new PlannerError(ERR.REQUIRES_UNDO_RESCHEDULE, 'This task was moved to another day. Undo the move to bring it back.')
  }
  return { ...occurrence, planState: PLAN_STATES.ACTIVE, excludedReason: null, excludedAt: null }
}

// What to do when the user deletes a task from a day (C1 = option C).
// Returns { action: 'delete', occurrenceId, day } or { action: 'exclude', occurrence, day }.
//   - Any task with progress is never hard-deleted; a finished (1.0) task cannot be removed.
//   - Before the baseline exists the plan is still being composed: the task is deleted,
//     its template is suppressed for the day, and the baseline is NOT stamped.
//   - After the baseline, an original-plan task is soft-removed (excluded / removed) so
//     the original plan stays truthful.
//   - After the baseline, a task added later is deleted (and suppressed) if untouched,
//     or soft-removed if it has partial progress.
export function planRemoval({ occurrence, day }, rawContext) {
  const ctx = resolveContext(rawContext)
  assertSameDay(occurrence, day)
  assertEditableDate(occurrence.planDate, ctx.today, ctx.config)
  if (occurrence.excludedReason === EXCLUDED_REASONS.RESCHEDULED) {
    throw new PlannerError(ERR.REQUIRES_UNDO_RESCHEDULE, 'This task was moved to another day. Undo the move first.')
  }
  if (occurrence.completion >= COMPLETION.DONE) {
    throw new PlannerError(ERR.HAS_PROGRESS, 'A finished task cannot be removed. Undo it first.')
  }
  if (day.baselineAt === null && occurrence.completion > 0) {
    throw new PlannerError(ERR.INVALID_STATE, 'A day with recorded progress must have a baseline.')
  }

  const soft = {
    action: 'exclude',
    occurrence: { ...occurrence, planState: PLAN_STATES.EXCLUDED, excludedReason: EXCLUDED_REASONS.REMOVED, excludedAt: ctx.nowIso },
    day,
  }
  if (day.baselineAt !== null && occurrence.inOriginalPlan) return soft
  if (occurrence.completion > 0) return soft
  return { action: 'delete', occurrenceId: occurrence.id, day: suppressTemplate(day, occurrence.templateId) }
}
