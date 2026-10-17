import { PLANNER_CONFIG, PLAN_STATES, RECURRENCE } from './constants.js'
import { ERR, PlannerError } from './errors.js'
import { compareDates, isValidDate, isValidTime, parseTime } from './localDates.js'
import { resolveContext } from './context.js'
import { occursOn } from './recurrence.js'
import { classifyDate } from './window.js'

// Fields copied from a template onto each occurrence (the occurrence is a
// self-contained snapshot, so history stays correct if the template changes).
export const SNAPSHOT_FIELDS = Object.freeze([
  'title',
  'description',
  'category',
  'isPriority',
  'plannedStart',
  'plannedEnd',
  'estimatedMinutes',
])

const blank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

// Validates and normalises user input for a task template. Returns
// { ok, value, errors }; `errors` maps field -> calm, specific message.
// Pass `today` (a local date) to also reject one-time tasks on days that can no
// longer be planned (older than the 7-date window or beyond the plan-ahead limit).
export function validateTemplateInput(input, { today, config } = {}) {
  const cfg = { ...PLANNER_CONFIG, ...config }
  const errors = {}
  if (!input || typeof input !== 'object') return { ok: false, value: null, errors: { form: 'Task details are missing.' } }

  const title = typeof input.title === 'string' ? input.title.trim() : ''
  if (!title) errors.title = 'Give the task a title.'
  else if (title.length > cfg.limits.titleMax) errors.title = `Keep the title under ${cfg.limits.titleMax} characters.`

  let description = null
  if (!blank(input.description)) {
    if (typeof input.description !== 'string') errors.description = 'Description must be text.'
    else if (input.description.trim().length > cfg.limits.descriptionMax) errors.description = `Keep the description under ${cfg.limits.descriptionMax} characters.`
    else description = input.description.trim()
  }

  let category = null
  if (!blank(input.category)) {
    if (typeof input.category !== 'string') errors.category = 'Category must be text.'
    else if (input.category.trim().length > cfg.limits.categoryMax) errors.category = `Keep the category under ${cfg.limits.categoryMax} characters.`
    else category = input.category.trim()
  }

  let isPriority = false
  if (input.isPriority !== undefined && input.isPriority !== null) {
    if (typeof input.isPriority === 'boolean') isPriority = input.isPriority
    else errors.isPriority = 'Priority must be on or off.'
  }

  let plannedStart = null
  if (!blank(input.plannedStart)) {
    if (isValidTime(input.plannedStart)) plannedStart = input.plannedStart
    else errors.plannedStart = 'Enter a time like 09:30.'
  }
  let plannedEnd = null
  if (!blank(input.plannedEnd)) {
    if (!isValidTime(input.plannedEnd)) errors.plannedEnd = 'Enter a time like 17:00.'
    else if (plannedStart === null && !errors.plannedStart) errors.plannedEnd = 'Add a start time first.'
    else if (plannedStart !== null && parseTime(input.plannedEnd) <= parseTime(plannedStart)) {
      errors.plannedEnd = 'The end time needs to be after the start time.'
    } else plannedEnd = input.plannedEnd
  }

  let estimatedMinutes = null
  if (!blank(input.estimatedMinutes)) {
    const n = typeof input.estimatedMinutes === 'string' && /^\d+$/.test(input.estimatedMinutes.trim())
      ? Number(input.estimatedMinutes)
      : input.estimatedMinutes
    if (Number.isInteger(n) && n >= 1 && n <= cfg.limits.estimatedMinutesMax) estimatedMinutes = n
    else errors.estimatedMinutes = `Enter whole minutes from 1 to ${cfg.limits.estimatedMinutesMax}.`
  }

  const recurrence = input.recurrence
  if (!Object.values(RECURRENCE).includes(recurrence)) errors.recurrence = 'Choose one time, daily, or selected days.'

  let weekdays = null
  if (recurrence === RECURRENCE.WEEKLY) {
    const list = input.weekdays
    const valid = Array.isArray(list) && list.length > 0 && list.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)
    if (valid) weekdays = [...new Set(list)].sort((a, b) => a - b)
    else errors.weekdays = 'Choose at least one day of the week.'
  } else if (Array.isArray(input.weekdays) && input.weekdays.length > 0) {
    errors.weekdays = 'Days of the week only apply to "selected days".'
  }

  let startsOn = null
  if (!isValidDate(input.startsOn)) errors.startsOn = 'Choose a valid start date.'
  else startsOn = input.startsOn

  let endsOn = null
  if (!blank(input.endsOn)) {
    if (!isValidDate(input.endsOn)) errors.endsOn = 'Choose a valid end date.'
    else if (startsOn && compareDates(input.endsOn, startsOn) < 0) errors.endsOn = 'The end date cannot be before the start date.'
    else endsOn = input.endsOn
  }
  if (recurrence === RECURRENCE.ONCE && startsOn) {
    if (endsOn !== null && endsOn !== startsOn) errors.endsOn = 'A one-time task happens on a single day.'
    endsOn = startsOn
    if (today && !errors.startsOn) {
      const kind = classifyDate(startsOn, today, cfg)
      if (kind === 'read_only_past') errors.startsOn = 'That day is part of your history, so it cannot be planned.'
      if (kind === 'beyond_plan_ahead') errors.startsOn = 'That is further ahead than you can plan.'
    }
  }

  const ok = Object.keys(errors).length === 0
  const value = ok
    ? { title, description, category, isPriority, plannedStart, plannedEnd, estimatedMinutes, recurrence, weekdays, startsOn, endsOn }
    : null
  return { ok, value, errors }
}

// Plans what happens to existing occurrences when a template is edited (spec 6.4).
// Only today-and-future, pending, active, non-customised occurrences are updated;
// the rest are reported with a reason and left untouched, so history never changes.
// Occurrences on dates the edited template no longer matches are listed in
// `noLongerMatching` and are NOT removed here (open question for the service layer).
export function planTemplateEdit({ template, changes, occurrences }, rawContext) {
  const ctx = resolveContext(rawContext)
  const merged = { ...template, ...changes }
  const check = validateTemplateInput(merged, { config: ctx.config })
  if (!check.ok) throw new PlannerError(ERR.INVALID_TEMPLATE, 'The edited task is not valid.', { errors: check.errors })
  const next = { ...template, ...check.value }

  const updates = []
  const skipped = []
  const noLongerMatching = []
  for (const occ of occurrences) {
    if (occ.templateId !== template.id) continue
    if (compareDates(occ.planDate, ctx.today) < 0) skipped.push({ id: occ.id, reason: 'past' })
    else if (occ.completion > 0) skipped.push({ id: occ.id, reason: 'has_progress' })
    else if (occ.planState !== PLAN_STATES.ACTIVE) skipped.push({ id: occ.id, reason: 'set_aside' })
    else if (occ.isCustomized) skipped.push({ id: occ.id, reason: 'customized' })
    else if (!occursOn(next, occ.planDate)) {
      noLongerMatching.push(occ.id)
      skipped.push({ id: occ.id, reason: 'no_longer_matches' })
    } else {
      const diff = {}
      for (const field of SNAPSHOT_FIELDS) if (occ[field] !== next[field]) diff[field] = next[field]
      if (Object.keys(diff).length > 0) updates.push({ id: occ.id, changes: diff })
    }
  }
  return { template: next, updates, skipped, noLongerMatching }
}
