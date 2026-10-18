// Row <-> domain mapping for the planner tables (database snake_case <-> the pure
// planner's camelCase). Writes are built ONLY from the column lists below, which
// mirror the columns the API lets a client write (backend/planner/resources.py; a test
// compares them), so the service can never try to write a server-maintained column
// such as in_original_plan, baseline_at or completed_at.

export const TEMPLATE_COLUMNS =
  'id, title, description, category, is_priority, planned_start, planned_end, estimated_minutes, recurrence, weekdays, starts_on, ends_on, archived_at, created_at'
export const DAY_COLUMNS = 'plan_date, day_mode, baseline_at, suppressed_template_ids'
export const OCCURRENCE_COLUMNS =
  'id, template_id, plan_date, title, description, category, is_priority, planned_start, planned_end, estimated_minutes, completion, completed_at, plan_state, excluded_reason, excluded_at, rescheduled_from_id, in_original_plan, is_customized, is_minimum, created_at'

// Columns clients may write (must equal the migration's grants).
export const WRITABLE = Object.freeze({
  templateInsert: ['user_id', 'title', 'description', 'category', 'is_priority', 'planned_start', 'planned_end', 'estimated_minutes', 'recurrence', 'weekdays', 'starts_on', 'ends_on', 'archived_at'],
  templateUpdate: ['title', 'description', 'category', 'is_priority', 'planned_start', 'planned_end', 'estimated_minutes', 'recurrence', 'weekdays', 'starts_on', 'ends_on', 'archived_at'],
  dayInsert: ['user_id', 'plan_date'],
  dayUpdate: ['day_mode', 'suppressed_template_ids'],
  occurrenceInsert: ['user_id', 'plan_date', 'template_id', 'title', 'description', 'category', 'is_priority', 'planned_start', 'planned_end', 'estimated_minutes', 'rescheduled_from_id', 'is_customized'],
  occurrenceUpdate: ['title', 'description', 'category', 'is_priority', 'planned_start', 'planned_end', 'estimated_minutes', 'completion', 'plan_state', 'excluded_reason', 'is_customized', 'is_minimum'],
})

// PostgREST returns `time` as HH:MM:SS; the planner works with HH:MM.
const hhmm = (value) => (typeof value === 'string' && value.length >= 5 ? value.slice(0, 5) : value ?? null)

export function templateFromRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    category: row.category ?? null,
    isPriority: Boolean(row.is_priority),
    plannedStart: hhmm(row.planned_start),
    plannedEnd: hhmm(row.planned_end),
    estimatedMinutes: row.estimated_minutes ?? null,
    recurrence: row.recurrence,
    weekdays: Array.isArray(row.weekdays) ? row.weekdays.map(Number) : null,
    startsOn: row.starts_on,
    endsOn: row.ends_on ?? null,
    archivedAt: row.archived_at ?? null,
    createdAt: row.created_at ?? null,
  }
}

export function dayFromRow(row) {
  return {
    planDate: row.plan_date,
    dayMode: row.day_mode,
    baselineAt: row.baseline_at ?? null,
    suppressedTemplateIds: Array.isArray(row.suppressed_template_ids) ? [...row.suppressed_template_ids] : [],
  }
}

export function occurrenceFromRow(row) {
  return {
    id: row.id,
    templateId: row.template_id ?? null,
    planDate: row.plan_date,
    title: row.title,
    description: row.description ?? null,
    category: row.category ?? null,
    isPriority: Boolean(row.is_priority),
    plannedStart: hhmm(row.planned_start),
    plannedEnd: hhmm(row.planned_end),
    estimatedMinutes: row.estimated_minutes ?? null,
    completion: Number(row.completion), // numeric may arrive as a string
    completedAt: row.completed_at ?? null,
    planState: row.plan_state,
    excludedReason: row.excluded_reason ?? null,
    excludedAt: row.excluded_at ?? null,
    rescheduledFromId: row.rescheduled_from_id ?? null,
    inOriginalPlan: Boolean(row.in_original_plan),
    isCustomized: Boolean(row.is_customized),
    isMinimum: Boolean(row.is_minimum),
    createdAt: row.created_at ?? null,
  }
}

const templateFields = (v) => ({
  title: v.title,
  description: v.description ?? null,
  category: v.category ?? null,
  is_priority: Boolean(v.isPriority),
  planned_start: v.plannedStart ?? null,
  planned_end: v.plannedEnd ?? null,
  estimated_minutes: v.estimatedMinutes ?? null,
  recurrence: v.recurrence,
  weekdays: v.weekdays ?? null,
  starts_on: v.startsOn,
  ends_on: v.endsOn ?? null,
})

// `value` is the normalised output of validateTemplateInput.
export const templateInsertRow = (userId, value) => ({ user_id: userId, ...templateFields(value) })
export const templateUpdateRow = (value) => templateFields(value)

export const dayInsertRow = (userId, planDate) => ({ user_id: userId, plan_date: planDate })

export const occurrenceInsertRow = (userId, draft) => ({
  user_id: userId,
  plan_date: draft.planDate,
  template_id: draft.templateId ?? null,
  title: draft.title,
  description: draft.description ?? null,
  category: draft.category ?? null,
  is_priority: Boolean(draft.isPriority),
  planned_start: draft.plannedStart ?? null,
  planned_end: draft.plannedEnd ?? null,
  estimated_minutes: draft.estimatedMinutes ?? null,
  rescheduled_from_id: draft.rescheduledFromId ?? null,
  is_customized: Boolean(draft.isCustomized),
})

// Completion and plan state only.
export const occurrenceStateRow = (occurrence) => ({
  completion: occurrence.completion,
  plan_state: occurrence.planState,
  excluded_reason: occurrence.excludedReason ?? null,
})

// Whether the task is part of the day's Minimum Day.
export const occurrenceMinimumRow = (isMinimum) => ({ is_minimum: Boolean(isMinimum) })

// Task details edited on a single day; marks the occurrence as customised so
// template edits no longer overwrite it.
export const occurrenceDetailsRow = (value) => ({
  title: value.title,
  description: value.description ?? null,
  category: value.category ?? null,
  is_priority: Boolean(value.isPriority),
  planned_start: value.plannedStart ?? null,
  planned_end: value.plannedEnd ?? null,
  estimated_minutes: value.estimatedMinutes ?? null,
  is_customized: true,
})

// Snapshot fields copied from an edited template onto a pending future occurrence.
// `changes` is the diff from planTemplateEdit (camelCase, snapshot fields only).
const DIFF_COLUMN = {
  title: 'title', description: 'description', category: 'category', isPriority: 'is_priority',
  plannedStart: 'planned_start', plannedEnd: 'planned_end', estimatedMinutes: 'estimated_minutes',
}
export function occurrenceDiffRow(changes) {
  const row = {}
  for (const [key, value] of Object.entries(changes)) {
    if (DIFF_COLUMN[key]) row[DIFF_COLUMN[key]] = value ?? null
  }
  return row
}
