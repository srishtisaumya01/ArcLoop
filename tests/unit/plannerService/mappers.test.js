// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  WRITABLE,
  dayFromRow,
  dayInsertRow,
  occurrenceDetailsRow,
  occurrenceDiffRow,
  occurrenceFromRow,
  occurrenceInsertRow,
  occurrenceStateRow,
  templateFromRow,
  templateInsertRow,
  templateUpdateRow,
} from '../../../src/services/planner/mappers.js'

const SERVER_ONLY = ['id', 'in_original_plan', 'baseline_at', 'completed_at', 'excluded_at', 'created_at', 'updated_at']

// The client lists must equal the API's lists: tests/integration/writableColumns.integration.test.js.
describe('writable columns', () => {
  it('no writable list ever includes a server-maintained column', () => {
    for (const [name, list] of Object.entries(WRITABLE)) {
      expect(list.filter((c) => SERVER_ONLY.includes(c)).filter((c) => !(c === 'archived_at')), name).toEqual([])
    }
  })
})

describe('payload builders emit only writable columns', () => {
  const template = { title: 'Walk', description: null, category: 'Health', isPriority: true, plannedStart: '07:00', plannedEnd: null, estimatedMinutes: 30, recurrence: 'weekly', weekdays: [1, 3], startsOn: '2026-03-10', endsOn: null }
  const draft = { templateId: 't', planDate: '2026-03-10', title: 'Walk', description: null, category: null, isPriority: false, plannedStart: null, plannedEnd: null, estimatedMinutes: null, rescheduledFromId: null, isCustomized: false, completion: 1, planState: 'excluded', inOriginalPlan: false, completedAt: 'x' }
  const keys = (o) => Object.keys(o).sort()

  it('template insert / update', () => {
    expect(keys(templateInsertRow('u', template))).toEqual([...WRITABLE.templateInsert.filter((c) => c !== 'archived_at')].sort())
    expect(keys(templateUpdateRow(template))).toEqual([...WRITABLE.templateUpdate.filter((c) => c !== 'archived_at')].sort())
    expect(templateInsertRow('u', template)).toMatchObject({ user_id: 'u', is_priority: true, priority_level: 'high', weekdays: [1, 3], planned_start: '07:00' })
  })

  it('occurrence insert ignores any state the draft carries (new rows start pending and active)', () => {
    const row = occurrenceInsertRow('u', draft)
    expect(keys(row)).toEqual([...WRITABLE.occurrenceInsert].sort())
    for (const forbidden of ['completion', 'plan_state', 'in_original_plan', 'completed_at']) expect(row).not.toHaveProperty(forbidden)
  })

  it('occurrence state, details and diff rows', () => {
    expect(occurrenceStateRow({ completion: 0.5, planState: 'excluded', excludedReason: 'busy_day' })).toEqual({ completion: 0.5, plan_state: 'excluded', excluded_reason: 'busy_day' })
    expect(occurrenceStateRow({ completion: 0, planState: 'active', excludedReason: null }).excluded_reason).toBeNull()
    const details = occurrenceDetailsRow({ title: 'T', isPriority: true })
    expect(details.is_customized).toBe(true)
    expect(keys(details).every((c) => WRITABLE.occurrenceUpdate.includes(c))).toBe(true)
    expect(occurrenceDiffRow({ title: 'New', plannedStart: null, bogus: 1, priorityLevel: 'low' })).toEqual({ title: 'New', planned_start: null, is_priority: false, priority_level: 'low' })
    expect(occurrenceDiffRow({ isPriority: true })).toEqual({ is_priority: true, priority_level: 'high' })
    expect(occurrenceDiffRow({ title: 'Only' })).toEqual({ title: 'Only' })
  })

  it('day insert', () => {
    expect(dayInsertRow('u', '2026-03-10')).toEqual({ user_id: 'u', plan_date: '2026-03-10' })
  })
})

describe('priority levels in rows', () => {
  const base = { id: 'o', plan_date: '2026-03-10', title: 'T', completion: 0, plan_state: 'active' }
  it('reads the level, and a row from before levels existed from its old flag', () => {
    expect(occurrenceFromRow({ ...base, priority_level: 'low', is_priority: false })).toMatchObject({ priorityLevel: 'low', isPriority: false })
    expect(occurrenceFromRow({ ...base, priority_level: 'high', is_priority: true })).toMatchObject({ priorityLevel: 'high', isPriority: true })
    expect(occurrenceFromRow({ ...base, is_priority: true })).toMatchObject({ priorityLevel: 'high', isPriority: true })
    expect(occurrenceFromRow({ ...base, is_priority: false })).toMatchObject({ priorityLevel: 'medium', isPriority: false })
    expect(occurrenceFromRow({ ...base, priority_level: 'nonsense', is_priority: false })).toMatchObject({ priorityLevel: 'medium' })
  })
  it('writes both columns, always in step', () => {
    expect(occurrenceDetailsRow({ title: 'T', priorityLevel: 'low' })).toMatchObject({ priority_level: 'low', is_priority: false })
    expect(occurrenceDetailsRow({ title: 'T', priorityLevel: 'high' })).toMatchObject({ priority_level: 'high', is_priority: true })
    expect(occurrenceDetailsRow({ title: 'T', isPriority: true })).toMatchObject({ priority_level: 'high', is_priority: true })
    expect(occurrenceDetailsRow({ title: 'T' })).toMatchObject({ priority_level: 'medium', is_priority: false })
  })
})

describe('row -> domain', () => {
  it('maps a template row, trimming PostgREST times to HH:MM', () => {
    const t = templateFromRow({ id: 'i', title: 'A', description: null, category: null, is_priority: true, planned_start: '07:00:00', planned_end: '08:30:00', estimated_minutes: 90, recurrence: 'weekly', weekdays: ['1', 3], starts_on: '2026-03-10', ends_on: null, archived_at: null, created_at: 'c' })
    expect(t).toMatchObject({ id: 'i', isPriority: true, priorityLevel: 'high', plannedStart: '07:00', plannedEnd: '08:30', estimatedMinutes: 90, weekdays: [1, 3], startsOn: '2026-03-10', endsOn: null })
  })

  it('maps an occurrence row, including numeric completion that arrives as a string', () => {
    const base = { id: 'o', template_id: null, plan_date: '2026-03-10', title: 'T', completion: '0.5', plan_state: 'active', in_original_plan: true, is_customized: false }
    expect(occurrenceFromRow(base).completion).toBe(0.5)
    expect(occurrenceFromRow({ ...base, completion: 1 }).completion).toBe(1)
    expect(occurrenceFromRow(base)).toMatchObject({ templateId: null, description: null, plannedStart: null, excludedReason: null, rescheduledFromId: null, inOriginalPlan: true })
  })

  it('maps a day row', () => {
    expect(dayFromRow({ plan_date: '2026-03-10', day_mode: 'busy', baseline_at: 'x', suppressed_template_ids: ['a'] })).toEqual({ planDate: '2026-03-10', dayMode: 'busy', baselineAt: 'x', suppressedTemplateIds: ['a'] })
    expect(dayFromRow({ plan_date: 'd', day_mode: 'normal', baseline_at: null, suppressed_template_ids: null }).suppressedTemplateIds).toEqual([])
  })
})
