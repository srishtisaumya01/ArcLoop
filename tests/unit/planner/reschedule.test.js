import { describe, expect, it } from 'vitest'
import {
  ERR,
  PlannerError,
  occurrencesToCreate,
  planRemoval,
  planUndoReschedule,
  rescheduleOccurrence,
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
const FRIDAY = '2026-03-13'

const source = (extra = {}) =>
  makeOcc({ id: 'src', templateId: 'tpl', title: 'Write report', description: 'Q1', category: 'Work', isPriority: true, plannedStart: '10:00', plannedEnd: '11:00', estimatedMinutes: 60, ...extra })
const move = (extra = {}, context = ctx()) =>
  rescheduleOccurrence({ occurrence: frozen(source(extra.occurrence)), day: frozen(makeDay(extra.day)), targetDate: FRIDAY, ...extra.args }, context)

describe('rescheduleOccurrence: preserving history', () => {
  it('keeps the original on its own date, set aside with the approved reason', () => {
    const r = move()
    expect(r.source).toMatchObject({ id: 'src', planDate: TODAY, planState: 'excluded', excludedReason: 'rescheduled', excludedAt: NOW_ISO, completion: 0, inOriginalPlan: true })
    expect(r.link).toEqual({ fromId: 'src', fromDate: TODAY, toDate: FRIDAY, reason: 'rescheduled' })
  })

  it('creates a linked occurrence on the new date with the same details', () => {
    const { target } = move()
    expect(target).toMatchObject({
      templateId: 'tpl', planDate: FRIDAY, title: 'Write report', description: 'Q1', category: 'Work', isPriority: true,
      plannedStart: '10:00', plannedEnd: '11:00', estimatedMinutes: 60,
      completion: 0, completedAt: null, planState: 'active', excludedReason: null, rescheduledFromId: 'src', isCustomized: false,
    })
    expect(target.id).toBeUndefined()
  })

  it('fixes the source day baseline (a move is a revision)', () => {
    expect(move().sourceDay.baselineAt).toBe(NOW_ISO)
  })

  it('does not mutate its inputs', () => {
    expect(() => move()).not.toThrow() // inputs are deep-frozen in `move`
  })

  it('works for a day that has not been created yet, and says so', () => {
    const r = move()
    expect(r.createsTargetDay).toBe(true)
    expect(r.targetDay).toEqual({ planDate: FRIDAY, dayMode: 'normal', baselineAt: null, suppressedTemplateIds: [] })
    expect(r.target.inOriginalPlan).toBe(true) // the target day has no baseline yet
  })

  it('a task landing on a day whose baseline is already fixed counts only in that day\'s current plan (D11)', () => {
    const targetDay = makeDay({ planDate: FRIDAY, baselineAt: '2026-03-13T09:00:00.000Z' })
    const r = move({ args: { targetDay } })
    expect(r.createsTargetDay).toBe(false)
    expect(r.target.inOriginalPlan).toBe(false)
  })

  it('removes the template from the target day suppression list, since the user asked for it there', () => {
    const targetDay = makeDay({ planDate: FRIDAY, suppressedTemplateIds: ['tpl', 'other'] })
    expect(move({ args: { targetDay } }).targetDay.suppressedTemplateIds).toEqual(['other'])
  })
})

describe('rescheduleOccurrence: progress follows the approved denominator rules', () => {
  it('moved task leaves the source revised plan but stays in its original plan; it is not double counted', () => {
    const day = makeDay()
    const a = makeOcc({ completion: 1, completedAt: BASELINE })
    const r = rescheduleOccurrence({ occurrence: source(), day, targetDate: FRIDAY }, ctx())
    const sourceDay = summarizeDay({ day: r.sourceDay, occurrences: [a, r.source] })
    expect(sourceDay.current).toMatchObject({ count: 1, percent: 100 })
    expect(sourceDay.original).toMatchObject({ count: 2, units: 1, percent: 50 })

    const targetDay = summarizeDay({ day: r.targetDay, occurrences: [{ ...r.target, id: 'new' }] })
    expect(targetDay.current).toMatchObject({ count: 1, units: 0, percent: 0 })
  })

  it('a partially completed task can be moved (C2 = B): 0.5 stays on the source day, the remainder is pending', () => {
    const half = source({ completion: 0.5, completedAt: BASELINE })
    const r = rescheduleOccurrence({ occurrence: frozen(half), day: frozen(makeDay({ baselineAt: BASELINE })), targetDate: FRIDAY }, ctx())
    expect(r.source).toMatchObject({ planState: 'excluded', completion: 0.5 })
    expect(r.target).toMatchObject({ completion: 0, completedAt: null })
    const s = summarizeDay({ day: r.sourceDay, occurrences: [r.source] })
    expect(s.original).toMatchObject({ count: 1, units: 0.5, percent: 50 })
    expect(s.current.percent).toBeNull()
  })

  it('a done task cannot be moved', () => {
    expect(code(() => move({ occurrence: { completion: 1, completedAt: BASELINE } }))).toBe(ERR.HAS_PROGRESS)
  })
})

describe('rescheduleOccurrence: validation', () => {
  it('needs a different, valid date', () => {
    expect(code(() => move({ args: { targetDate: TODAY } }))).toBe(ERR.INVALID_RESCHEDULE_TARGET)
    expect(code(() => move({ args: { targetDate: '2026-02-30' } }))).toBe(ERR.INVALID_DATE)
    expect(code(() => move({ args: { targetDate: undefined } }))).toBe(ERR.INVALID_DATE)
  })

  it('refuses read-only source days and targets outside the window', () => {
    expect(code(() => move({ occurrence: { planDate: '2026-03-03' }, day: { planDate: '2026-03-03' } }))).toBe(ERR.DATE_NOT_EDITABLE)
    expect(code(() => move({ args: { targetDate: '2026-03-03' } }))).toBe(ERR.DATE_NOT_EDITABLE)
    expect(code(() => move({ args: { targetDate: '2026-03-04' } }))).toBeNull() // today - 6
    expect(code(() => move({ args: { targetDate: '2026-04-09' } }))).toBeNull() // today + 30
    expect(code(() => move({ args: { targetDate: '2026-04-10' } }))).toBe(ERR.BEYOND_PLAN_AHEAD)
  })

  it('refuses a task that is already set aside', () => {
    expect(code(() => move({ occurrence: { planState: 'excluded', excludedReason: 'busy_day' } }))).toBe(ERR.NOT_ACTIVE)
  })

  it('refuses when the same template is already planned on the target date', () => {
    const existing = [makeOcc({ templateId: 'tpl', planDate: FRIDAY })]
    expect(code(() => move({ args: { occurrencesOnTarget: existing } }))).toBe(ERR.ALREADY_PLANNED_ON_TARGET)
  })

  it('allows a task with no template to land on a day that has other tasks', () => {
    const existing = [makeOcc({ templateId: 'tpl', planDate: FRIDAY })]
    expect(code(() => move({ occurrence: { templateId: null }, args: { occurrencesOnTarget: existing } }))).toBeNull()
  })

  it('needs an id to link the move, and matching day plans', () => {
    expect(code(() => rescheduleOccurrence({ occurrence: { ...source(), id: undefined }, day: makeDay(), targetDate: FRIDAY }, ctx()))).toBe(ERR.INVALID_ARGUMENT)
    expect(code(() => move({ args: { targetDay: makeDay({ planDate: '2026-03-14' }) } }))).toBe(ERR.INVALID_STATE)
    expect(code(() => rescheduleOccurrence({ occurrence: source({ planDate: '2026-03-09' }), day: makeDay(), targetDate: FRIDAY }, ctx()))).toBe(ERR.INVALID_STATE)
  })
})

describe('rescheduleOccurrence: optional new times', () => {
  it('keeps the times when undefined, changes them when given, clears them with null', () => {
    expect(move().target).toMatchObject({ plannedStart: '10:00', plannedEnd: '11:00', isCustomized: false })
    const changed = move({ args: { plannedStart: '14:00', plannedEnd: '15:30' } }).target
    expect(changed).toMatchObject({ plannedStart: '14:00', plannedEnd: '15:30', isCustomized: true })
    const cleared = move({ args: { plannedStart: null, plannedEnd: null } }).target
    expect(cleared).toMatchObject({ plannedStart: null, plannedEnd: null })
  })

  it('validates times', () => {
    expect(code(() => move({ args: { plannedStart: '25:00' } }))).toBe(ERR.INVALID_TIME)
    expect(code(() => move({ args: { plannedStart: '15:00', plannedEnd: '14:00' } }))).toBe(ERR.INVALID_TIME)
    expect(code(() => move({ args: { plannedStart: null } }))).toBe(ERR.INVALID_TIME) // end kept, start cleared
  })

  it('the original keeps its original time (history is not rewritten)', () => {
    const r = move({ args: { plannedStart: '14:00', plannedEnd: '15:30' } })
    expect(r.source).toMatchObject({ plannedStart: '10:00', plannedEnd: '11:00' })
  })
})

describe('moving a recurring task never breaks the template or duplicates it', () => {
  it('after moving Thursday\'s task to Friday, reopening either day creates nothing new', () => {
    const template = makeTemplate({ id: 'tpl', recurrence: 'weekly', weekdays: [2, 4] }) // Tue, Thu
    const tue = makeOcc({ id: 'src', templateId: 'tpl', planDate: TODAY })
    const r = rescheduleOccurrence({ occurrence: tue, day: makeDay(), targetDate: FRIDAY }, ctx())
    const reopenTue = occurrencesToCreate({ templates: [template], occurrences: [r.source], day: r.sourceDay, planDate: TODAY }, ctx())
    expect(reopenTue).toEqual([])
    const reopenFri = occurrencesToCreate({ templates: [template], occurrences: [{ ...r.target, id: 'new' }], day: r.targetDay, planDate: FRIDAY }, ctx())
    expect(reopenFri).toEqual([]) // Friday is not a Tue/Thu anyway
  })
})

describe('planUndoReschedule', () => {
  const moved = () => {
    const r = rescheduleOccurrence({ occurrence: source(), day: makeDay(), targetDate: FRIDAY }, ctx())
    return { r, target: { ...r.target, id: 'new' } }
  }

  it('restores the source and removes the target (deleted and suppressed, no resurrection)', () => {
    const { r, target } = moved()
    const u = planUndoReschedule({ source: frozen(r.source), target: frozen(target), targetDay: frozen(r.targetDay) }, ctx())
    expect(u.source).toMatchObject({ planState: 'active', excludedReason: null, excludedAt: null, planDate: TODAY, completion: 0 })
    expect(u.targetResult).toMatchObject({ action: 'delete', occurrenceId: 'new' })
    expect(u.targetDay.suppressedTemplateIds).toEqual(['tpl'])
  })

  it('keeps a partial source\'s progress when the move is undone', () => {
    const half = source({ completion: 0.5, completedAt: BASELINE })
    const r = rescheduleOccurrence({ occurrence: half, day: makeDay({ baselineAt: BASELINE }), targetDate: FRIDAY }, ctx())
    const u = planUndoReschedule({ source: r.source, target: { ...r.target, id: 'new' }, targetDay: r.targetDay }, ctx())
    expect(u.source).toMatchObject({ planState: 'active', completion: 0.5 })
  })

  it('soft-removes the target when it is part of that day\'s original plan after a baseline exists', () => {
    const { r, target } = moved()
    const targetDay = { ...r.targetDay, baselineAt: '2026-03-13T08:00:00.000Z' }
    const u = planUndoReschedule({ source: r.source, target: { ...target, inOriginalPlan: true }, targetDay }, ctx())
    expect(u.targetResult.action).toBe('exclude')
    expect(u.targetResult.occurrence.excludedReason).toBe('removed')
  })

  it('refuses when progress was recorded on the new day', () => {
    const { r, target } = moved()
    expect(code(() => planUndoReschedule({ source: r.source, target: { ...target, completion: 0.5 }, targetDay: r.targetDay }, ctx()))).toBe(ERR.HAS_PROGRESS)
  })

  it('refuses mismatched or non-moved tasks', () => {
    const { r, target } = moved()
    expect(code(() => planUndoReschedule({ source: makeOcc(), target, targetDay: r.targetDay }, ctx()))).toBe(ERR.NOT_EXCLUDED)
    expect(code(() => planUndoReschedule({ source: r.source, target: { ...target, rescheduledFromId: 'zzz' }, targetDay: r.targetDay }, ctx()))).toBe(ERR.INVALID_STATE)
  })

  it('a chain of moves must be undone from the last move back', () => {
    const { r, target } = moved()
    const second = rescheduleOccurrence({ occurrence: target, day: r.targetDay, targetDate: '2026-03-16' }, ctx())
    // The middle task was itself moved on, so it cannot be removed until that move is undone.
    expect(code(() => planUndoReschedule({ source: r.source, target: second.source, targetDay: second.sourceDay }, ctx()))).toBe(ERR.REQUIRES_UNDO_RESCHEDULE)
  })

  it('refuses a read-only source day', () => {
    const old = makeOcc({ id: 'old', planDate: '2026-03-03', planState: 'excluded', excludedReason: 'rescheduled' })
    const target = makeOcc({ id: 'n', rescheduledFromId: 'old', planDate: FRIDAY })
    expect(code(() => planUndoReschedule({ source: old, target, targetDay: makeDay({ planDate: FRIDAY }) }, ctx()))).toBe(ERR.DATE_NOT_EDITABLE)
  })
})

describe('planRemoval and reschedule interplay', () => {
  it('a moved original task cannot be hard-deleted on its source day', () => {
    const r = rescheduleOccurrence({ occurrence: source(), day: makeDay(), targetDate: FRIDAY }, ctx())
    expect(code(() => planRemoval({ occurrence: r.source, day: r.sourceDay }, ctx()))).toBe(ERR.REQUIRES_UNDO_RESCHEDULE)
  })
})
