import { describe, expect, it } from 'vitest'
import {
  ERR,
  PlannerError,
  createOccurrenceDraft,
  occurrencesToCreate,
  planRemoval,
  restoreOccurrence,
  setAside,
  setCompletion,
  summarizeDay,
} from '../../../src/utils/planner/index.js'
import { NOW, TODAY, ctx, frozen, makeDay, makeOcc, makeTemplate } from './fixtures.js'

const code = (fn) => {
  try {
    fn()
  } catch (e) {
    return e instanceof PlannerError ? e.code : `non-planner:${e.name}`
  }
  return null
}
const BASELINE = '2026-03-10T09:00:00.000Z'
const NOW_ISO = new Date(NOW).toISOString()

describe('createOccurrenceDraft / occurrencesToCreate (lazy top-up, C1)', () => {
  const daily = makeTemplate({ id: 'a', title: 'Walk', plannedStart: '07:00', isPriority: true, category: 'Exercise' })

  it('copies the template into a self-contained snapshot', () => {
    const draft = createOccurrenceDraft(daily, TODAY, makeDay())
    expect(draft).toMatchObject({
      templateId: 'a', planDate: TODAY, title: 'Walk', plannedStart: '07:00', isPriority: true, category: 'Exercise',
      completion: 0, completedAt: null, planState: 'active', excludedReason: null, rescheduledFromId: null, isCustomized: false,
    })
    expect(draft.id).toBeUndefined() // the database assigns ids
  })

  it('belongs to the original plan only while the day has no baseline (D11)', () => {
    expect(createOccurrenceDraft(daily, TODAY, makeDay()).inOriginalPlan).toBe(true)
    expect(createOccurrenceDraft(daily, TODAY, makeDay({ baselineAt: BASELINE })).inOriginalPlan).toBe(false)
  })

  it('creates one occurrence per matching template, in template order', () => {
    const templates = [daily, makeTemplate({ id: 'b', title: 'Read' }), makeTemplate({ id: 'c', recurrence: 'weekly', weekdays: [3] })]
    // 2026-03-10 is a Tuesday: the Wednesday-only template does not match.
    const drafts = occurrencesToCreate({ templates, occurrences: [], day: makeDay(), planDate: TODAY }, ctx())
    expect(drafts.map((d) => d.templateId)).toEqual(['a', 'b'])
  })

  it('is idempotent: no duplicate when an occurrence already exists', () => {
    const existing = [makeOcc({ templateId: 'a', planDate: TODAY })]
    const drafts = occurrencesToCreate({ templates: [daily, makeTemplate({ id: 'b' })], occurrences: existing, day: makeDay(), planDate: TODAY }, ctx())
    expect(drafts.map((d) => d.templateId)).toEqual(['b'])
    const again = occurrencesToCreate({ templates: [daily], occurrences: existing, day: makeDay(), planDate: TODAY }, ctx())
    expect(again).toEqual([])
  })

  it('counts an existing set-aside or removed occurrence as present, so it is not recreated', () => {
    const removed = makeOcc({ templateId: 'a', planDate: TODAY, planState: 'excluded', excludedReason: 'removed' })
    expect(occurrencesToCreate({ templates: [daily], occurrences: [removed], day: makeDay({ baselineAt: BASELINE }), planDate: TODAY }, ctx())).toEqual([])
  })

  it('ignores occurrences on other dates', () => {
    const yesterday = [makeOcc({ templateId: 'a', planDate: '2026-03-09' })]
    expect(occurrencesToCreate({ templates: [daily], occurrences: yesterday, day: makeDay(), planDate: TODAY }, ctx())).toHaveLength(1)
  })

  it('skips templates on the day suppression list', () => {
    const day = makeDay({ suppressedTemplateIds: ['a'] })
    const drafts = occurrencesToCreate({ templates: [daily, makeTemplate({ id: 'b' })], occurrences: [], day, planDate: TODAY }, ctx())
    expect(drafts.map((d) => d.templateId)).toEqual(['b'])
  })

  it('respects template start and end dates', () => {
    const later = makeTemplate({ id: 'later', startsOn: '2026-03-11' })
    const ended = makeTemplate({ id: 'ended', startsOn: '2026-01-01', endsOn: '2026-03-09' })
    expect(occurrencesToCreate({ templates: [later, ended], occurrences: [], day: makeDay(), planDate: TODAY }, ctx())).toEqual([])
  })

  it('never creates days older than the 7-date window, or beyond the planning limit (D5, D10)', () => {
    const forDate = (planDate) => () => occurrencesToCreate({ templates: [daily], occurrences: [], day: makeDay({ planDate }), planDate }, ctx())
    expect(code(forDate('2026-03-03'))).toBe(ERR.DATE_NOT_EDITABLE) // today - 7
    expect(code(forDate('2026-03-04'))).toBeNull() // today - 6
    expect(code(forDate('2026-04-09'))).toBeNull() // today + 30
    expect(code(forDate('2026-04-10'))).toBe(ERR.BEYOND_PLAN_AHEAD)
  })

  it('refuses a day plan for a different date', () => {
    expect(code(() => occurrencesToCreate({ templates: [daily], occurrences: [], day: makeDay({ planDate: '2026-03-11' }), planDate: TODAY }, ctx()))).toBe(ERR.INVALID_STATE)
  })

  it('does not mutate its inputs', () => {
    expect(() => occurrencesToCreate({ templates: frozen([daily]), occurrences: frozen([]), day: frozen(makeDay()), planDate: TODAY }, ctx())).not.toThrow()
  })
})

describe('setCompletion', () => {
  it('records each valid value and stamps the baseline on first progress', () => {
    for (const value of [0.5, 1]) {
      const r = setCompletion({ occurrence: frozen(makeOcc()), day: frozen(makeDay()), value }, ctx())
      expect(r.occurrence.completion).toBe(value)
      expect(r.occurrence.completedAt).toBe(NOW_ISO)
      expect(r.day.baselineAt).toBe(NOW_ISO)
      expect(r.changed).toBe(true)
    }
  })

  it('rejects invalid values without changing anything', () => {
    for (const bad of [0.25, 2, -1, '1', null, NaN]) {
      expect(code(() => setCompletion({ occurrence: makeOcc(), day: makeDay(), value: bad }, ctx())), String(bad)).toBe(ERR.INVALID_COMPLETION)
    }
  })

  it('undo returns to 0, clears the timestamp and keeps the baseline already fixed', () => {
    const occurrence = makeOcc({ completion: 1, completedAt: '2026-03-10T10:00:00.000Z' })
    const day = makeDay({ baselineAt: BASELINE })
    const r = setCompletion({ occurrence: frozen(occurrence), day: frozen(day), value: 0 }, ctx())
    expect(r.occurrence).toMatchObject({ completion: 0, completedAt: null })
    expect(r.day.baselineAt).toBe(BASELINE)
  })

  it('does not stamp a baseline when progress is reset to 0', () => {
    const r = setCompletion({ occurrence: makeOcc({ completion: 0.5 }), day: makeDay(), value: 0 }, ctx())
    expect(r.day.baselineAt).toBeNull()
  })

  it('partial then done becomes 1, not 1.5', () => {
    const half = setCompletion({ occurrence: makeOcc(), day: makeDay(), value: 0.5 }, ctx())
    const done = setCompletion({ occurrence: half.occurrence, day: half.day, value: 1 }, ctx())
    expect(done.occurrence.completion).toBe(1)
  })

  it('setting the same value is a no-op that returns the same objects (no duplicate credit)', () => {
    const occurrence = makeOcc({ completion: 1, completedAt: '2026-03-10T10:00:00.000Z' })
    const day = makeDay({ baselineAt: BASELINE })
    const r = setCompletion({ occurrence, day, value: 1 }, ctx())
    expect(r.changed).toBe(false)
    expect(r.occurrence).toBe(occurrence)
    expect(r.day).toBe(day)
  })

  it('cannot record progress in the future or outside the window', () => {
    const future = makeOcc({ planDate: '2026-03-11' })
    expect(code(() => setCompletion({ occurrence: future, day: makeDay({ planDate: '2026-03-11' }), value: 1 }, ctx()))).toBe(ERR.FUTURE_DATE)
    const old = makeOcc({ planDate: '2026-03-03' })
    expect(code(() => setCompletion({ occurrence: old, day: makeDay({ planDate: '2026-03-03' }), value: 1 }, ctx()))).toBe(ERR.DATE_NOT_EDITABLE)
    const edge = makeOcc({ planDate: '2026-03-04' }) // today - 6: still editable
    expect(code(() => setCompletion({ occurrence: edge, day: makeDay({ planDate: '2026-03-04' }), value: 1 }, ctx()))).toBeNull()
  })

  it('uses the profile timezone to decide what "today" is', () => {
    // 2026-03-11T02:00Z is still 2026-03-10 in New York but already 2026-03-11 in Kolkata.
    const occurrence = makeOcc({ planDate: '2026-03-11' })
    const day = makeDay({ planDate: '2026-03-11' })
    const now = '2026-03-11T02:00:00Z'
    expect(code(() => setCompletion({ occurrence, day, value: 1 }, { now, timeZone: 'America/New_York' }))).toBe(ERR.FUTURE_DATE)
    expect(code(() => setCompletion({ occurrence, day, value: 1 }, { now, timeZone: 'Asia/Kolkata' }))).toBeNull()
  })

  it('refuses when the task and day are for different dates', () => {
    expect(code(() => setCompletion({ occurrence: makeOcc({ planDate: '2026-03-09' }), day: makeDay(), value: 1 }, ctx()))).toBe(ERR.INVALID_STATE)
  })

  it('doing more of a set-aside task puts it back in the current plan', () => {
    const excluded = makeOcc({ planState: 'excluded', excludedReason: 'busy_day', excludedAt: BASELINE })
    const r = setCompletion({ occurrence: frozen(excluded), day: frozen(makeDay({ baselineAt: BASELINE })), value: 0.5 }, ctx())
    expect(r.restored).toBe(true)
    expect(r.occurrence).toMatchObject({ planState: 'active', excludedReason: null, excludedAt: null, completion: 0.5 })
  })

  it('lowering progress on a set-aside task leaves it set aside', () => {
    const excluded = makeOcc({ completion: 0.5, completedAt: BASELINE, planState: 'excluded', excludedReason: 'busy_day' })
    const r = setCompletion({ occurrence: excluded, day: makeDay({ baselineAt: BASELINE }), value: 0 }, ctx())
    expect(r.restored).toBe(false)
    expect(r.occurrence.planState).toBe('excluded')
  })

  it('a task that was moved to another day needs the move undone first', () => {
    const moved = makeOcc({ planState: 'excluded', excludedReason: 'rescheduled' })
    expect(code(() => setCompletion({ occurrence: moved, day: makeDay({ baselineAt: BASELINE }), value: 1 }, ctx()))).toBe(ERR.REQUIRES_UNDO_RESCHEDULE)
  })
})

describe('setAside (C2 = B: partial tasks may be set aside, done tasks may not)', () => {
  it('sets a pending task aside, keeps its record and stamps the baseline', () => {
    const r = setAside({ occurrence: frozen(makeOcc()), day: frozen(makeDay()), reason: 'busy_day' }, ctx())
    expect(r.occurrence).toMatchObject({ planState: 'excluded', excludedReason: 'busy_day', excludedAt: NOW_ISO, completion: 0, inOriginalPlan: true })
    expect(r.day.baselineAt).toBe(NOW_ISO)
  })

  it('allows a partially completed task and keeps its 0.5', () => {
    const half = makeOcc({ completion: 0.5, completedAt: BASELINE })
    const r = setAside({ occurrence: half, day: makeDay({ baselineAt: BASELINE }), reason: 'rest_day' }, ctx())
    expect(r.occurrence).toMatchObject({ planState: 'excluded', excludedReason: 'rest_day', completion: 0.5 })
  })

  it('refuses a done task', () => {
    const done = makeOcc({ completion: 1, completedAt: BASELINE })
    expect(code(() => setAside({ occurrence: done, day: makeDay({ baselineAt: BASELINE }), reason: 'busy_day' }, ctx()))).toBe(ERR.HAS_PROGRESS)
  })

  it('refuses an already set-aside task and invalid reasons', () => {
    const already = makeOcc({ planState: 'excluded', excludedReason: 'busy_day' })
    expect(code(() => setAside({ occurrence: already, day: makeDay({ baselineAt: BASELINE }), reason: 'busy_day' }, ctx()))).toBe(ERR.NOT_ACTIVE)
    for (const reason of ['rescheduled', 'removed', 'nope', undefined]) {
      expect(code(() => setAside({ occurrence: makeOcc(), day: makeDay(), reason }, ctx())), String(reason)).toBe(ERR.INVALID_ARGUMENT)
    }
  })

  it('refuses read-only days', () => {
    expect(code(() => setAside({ occurrence: makeOcc({ planDate: '2026-03-03' }), day: makeDay({ planDate: '2026-03-03' }), reason: 'busy_day' }, ctx()))).toBe(ERR.DATE_NOT_EDITABLE)
  })

  it('does not change the original-plan membership', () => {
    const r = setAside({ occurrence: makeOcc({ inOriginalPlan: true }), day: makeDay(), reason: 'busy_day' }, ctx())
    expect(r.occurrence.inOriginalPlan).toBe(true)
  })
})

describe('restoreOccurrence', () => {
  it('brings a set-aside task back', () => {
    const excluded = makeOcc({ planState: 'excluded', excludedReason: 'busy_day', excludedAt: BASELINE })
    expect(restoreOccurrence({ occurrence: frozen(excluded) }, ctx())).toMatchObject({ planState: 'active', excludedReason: null, excludedAt: null })
  })

  it('refuses an active task, and a moved task until the move is undone', () => {
    expect(code(() => restoreOccurrence({ occurrence: makeOcc() }, ctx()))).toBe(ERR.NOT_EXCLUDED)
    const moved = makeOcc({ planState: 'excluded', excludedReason: 'rescheduled' })
    expect(code(() => restoreOccurrence({ occurrence: moved }, ctx()))).toBe(ERR.REQUIRES_UNDO_RESCHEDULE)
  })
})

describe('planRemoval (C1 = option C: hard delete plus suppression list)', () => {
  const tplOcc = (extra = {}) => makeOcc({ id: 'x', templateId: 'a', ...extra })

  it('before the baseline: deletes, suppresses the template and does NOT stamp the baseline', () => {
    const day = makeDay()
    const r = planRemoval({ occurrence: frozen(tplOcc()), day: frozen(day) }, ctx())
    expect(r.action).toBe('delete')
    expect(r.occurrenceId).toBe('x')
    expect(r.day.suppressedTemplateIds).toEqual(['a'])
    expect(r.day.baselineAt).toBeNull()
  })

  it('a deleted task is not resurrected by the next top-up (the C1 scenario)', () => {
    const template = makeTemplate({ id: 'a' })
    const day0 = makeDay()
    const created = occurrencesToCreate({ templates: [template], occurrences: [], day: day0, planDate: TODAY }, ctx())
    const live = makeOcc({ id: 'x', templateId: 'a', ...created[0] })
    const r = planRemoval({ occurrence: live, day: day0 }, ctx())
    const afterReload = occurrencesToCreate({ templates: [template], occurrences: [], day: r.day, planDate: TODAY }, ctx())
    expect(afterReload).toEqual([])
  })

  it('after the baseline an original-plan task is soft-removed and stays in the original plan', () => {
    const day = makeDay({ baselineAt: BASELINE })
    const r = planRemoval({ occurrence: frozen(tplOcc({ inOriginalPlan: true })), day: frozen(day) }, ctx())
    expect(r.action).toBe('exclude')
    expect(r.occurrence).toMatchObject({ planState: 'excluded', excludedReason: 'removed', inOriginalPlan: true })
    expect(r.day).toEqual(day) // a soft removal neither suppresses the template nor changes the baseline
    const s = summarizeDay({ day, occurrences: [r.occurrence, makeOcc()] })
    expect(s.original.count).toBe(2)
    expect(s.current.count).toBe(1)
  })

  it('after the baseline a task added later is deleted and suppressed if untouched', () => {
    const r = planRemoval({ occurrence: tplOcc({ inOriginalPlan: false }), day: makeDay({ baselineAt: BASELINE }) }, ctx())
    expect(r.action).toBe('delete')
    expect(r.day.suppressedTemplateIds).toEqual(['a'])
  })

  it('a task added later with partial progress is soft-removed so the record survives', () => {
    const r = planRemoval({ occurrence: tplOcc({ inOriginalPlan: false, completion: 0.5, completedAt: BASELINE }), day: makeDay({ baselineAt: BASELINE }) }, ctx())
    expect(r.action).toBe('exclude')
    expect(r.occurrence.completion).toBe(0.5)
  })

  it('a partially completed original task is soft-removed, never hard-deleted', () => {
    const r = planRemoval({ occurrence: tplOcc({ completion: 0.5, completedAt: BASELINE }), day: makeDay({ baselineAt: BASELINE }) }, ctx())
    expect(r.action).toBe('exclude')
    expect(r.occurrence.completion).toBe(0.5)
  })

  it('a done task cannot be removed', () => {
    expect(code(() => planRemoval({ occurrence: tplOcc({ completion: 1, completedAt: BASELINE }), day: makeDay({ baselineAt: BASELINE }) }, ctx()))).toBe(ERR.HAS_PROGRESS)
  })

  it('a manually created task (no template) is deleted without touching the suppression list', () => {
    const r = planRemoval({ occurrence: makeOcc({ id: 'm', templateId: null }), day: makeDay() }, ctx())
    expect(r.action).toBe('delete')
    expect(r.day.suppressedTemplateIds).toEqual([])
  })

  it('does not duplicate suppression entries', () => {
    const r = planRemoval({ occurrence: tplOcc(), day: makeDay({ suppressedTemplateIds: ['a'] }) }, ctx())
    expect(r.day.suppressedTemplateIds).toEqual(['a'])
  })

  it('a moved task must have the move undone first', () => {
    const moved = tplOcc({ planState: 'excluded', excludedReason: 'rescheduled' })
    expect(code(() => planRemoval({ occurrence: moved, day: makeDay({ baselineAt: BASELINE }) }, ctx()))).toBe(ERR.REQUIRES_UNDO_RESCHEDULE)
  })

  it('refuses read-only days and inconsistent state', () => {
    expect(code(() => planRemoval({ occurrence: makeOcc({ planDate: '2026-03-03' }), day: makeDay({ planDate: '2026-03-03' }) }, ctx()))).toBe(ERR.DATE_NOT_EDITABLE)
    expect(code(() => planRemoval({ occurrence: makeOcc({ completion: 0.5 }), day: makeDay() }, ctx()))).toBe(ERR.INVALID_STATE)
  })
})
