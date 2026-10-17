import { DAY_MODES, EXCLUDED_REASONS, PLAN_STATES } from './constants.js'
import { resolveContext } from './context.js'
import { ERR, PlannerError } from './errors.js'
import { parseDate } from './localDates.js'
import { assertEditableDate } from './window.js'

// Day-level state. A day is { planDate, dayMode, baselineAt, suppressedTemplateIds }.
// All functions return new objects; inputs are never modified.

export function createDay(planDate) {
  parseDate(planDate)
  return { planDate, dayMode: DAY_MODES.NORMAL, baselineAt: null, suppressedTemplateIds: [] }
}

export const isValidDayMode = (mode) => Object.values(DAY_MODES).includes(mode)
export const isRestDay = (day) => day.dayMode === DAY_MODES.REST

// The baseline (original plan) is fixed once, the first time the day is
// revised or progress is recorded. Occurrences created before then are part of
// the original plan; occurrences created after are not (D11).
export function stampBaseline(day, nowIso) {
  return day.baselineAt ? day : { ...day, baselineAt: nowIso }
}

// Switching mode only changes the day's label. It never touches an occurrence,
// so no task is discarded and no check-in is rewritten. Choosing Busy or Rest
// counts as a revision and fixes the baseline first; switching back to Normal
// leaves the baseline in place.
export function setDayMode({ day, mode }, rawContext) {
  if (!isValidDayMode(mode)) throw new PlannerError(ERR.INVALID_DAY_MODE, `Unknown day mode: ${String(mode)}`)
  const ctx = resolveContext(rawContext)
  assertEditableDate(day.planDate, ctx.today, ctx.config)
  if (day.dayMode === mode) return day
  const next = { ...day, dayMode: mode }
  return mode === DAY_MODES.NORMAL ? next : stampBaseline(next, ctx.nowIso)
}

// A deleted task from a template is remembered so day top-ups do not recreate it (C1).
export function suppressTemplate(day, templateId) {
  if (!templateId || day.suppressedTemplateIds.includes(templateId)) return day
  return { ...day, suppressedTemplateIds: [...day.suppressedTemplateIds, templateId] }
}

export function unsuppressTemplate(day, templateId) {
  if (!day.suppressedTemplateIds.includes(templateId)) return day
  return { ...day, suppressedTemplateIds: day.suppressedTemplateIds.filter((id) => id !== templateId) }
}

// Guided shortcut for Busy and Rest days: which tasks to PROPOSE setting aside.
// It only suggests; the user chooses, and each task is set aside explicitly
// (always reversible). Priority tasks are kept in Busy mode; Done tasks are never proposed.
export function proposeSetAside({ mode, occurrences }) {
  const open = occurrences.filter((o) => o.planState === PLAN_STATES.ACTIVE && o.completion < 1)
  if (mode === DAY_MODES.BUSY) {
    return { reason: EXCLUDED_REASONS.BUSY_DAY, ids: open.filter((o) => !o.isPriority).map((o) => o.id) }
  }
  if (mode === DAY_MODES.REST) {
    return { reason: EXCLUDED_REASONS.REST_DAY, ids: open.map((o) => o.id) }
  }
  if (!isValidDayMode(mode)) throw new PlannerError(ERR.INVALID_DAY_MODE, `Unknown day mode: ${String(mode)}`)
  return { reason: null, ids: [] }
}
