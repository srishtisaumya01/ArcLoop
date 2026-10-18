import { describe, expect, it } from 'vitest'
import {
  ERR,
  PLANNER_CONFIG,
  PlannerError,
  buildPlanSnapshot,
  isMinimumTask,
  minimumOccurrences,
  planMinimum,
  proposeSetAside,
  setAside,
  setCompletion,
  summarizeDay,
  summarizeHabits,
  summarizeMinimum,
  summarizeWeek,
} from '../../../src/utils/planner/index.js'
import { TODAY, ctx, frozen, makeDay, makeOcc } from './fixtures.js'

const code = (fn) => {
  try {
    fn()
  } catch (e) {
    return e instanceof PlannerError ? e.code : `non-planner:${e.name}`
  }
  return null
}
const mk = (n, overrides = {}) => Array.from({ length: n }, (_, i) => makeOcc({ id: `m${i}`, title: `Task ${i}`, ...overrides }))

describe('what counts as part of the minimum', () => {
  it('is a flagged task that is still planned', () => {
    const flagged = makeOcc({ isMinimum: true })
    expect(isMinimumTask(flagged)).toBe(true)
    expect(isMinimumTask(makeOcc())).toBe(false)
    expect(isMinimumTask({ ...flagged, planState: 'excluded', excludedReason: 'busy_day' })).toBe(false) // setting it aside takes it out
  })

  it('lists only those tasks', () => {
    const tasks = [makeOcc({ isMinimum: true }), makeOcc(), makeOcc({ isMinimum: true, planState: 'excluded', excludedReason: 'busy_day' })]
    expect(minimumOccurrences(tasks)).toEqual([tasks[0]])
  })
})

describe('summarizeMinimum is reported on its own', () => {
  it('has no minimum by default', () => {
    expect(summarizeMinimum([makeOcc(), makeOcc({ completion: 1 })])).toEqual({ count: 0, done: 0, partial: 0, ids: [], status: 'none' })
  })

  it('is open until every chosen task is done', () => {
    const tasks = [makeOcc({ id: 'a', isMinimum: true, completion: 1 }), makeOcc({ id: 'b', isMinimum: true, completion: 0.5 }), makeOcc({ id: 'c', completion: 1 })]
    expect(summarizeMinimum(tasks)).toEqual({ count: 2, done: 1, partial: 1, ids: ['a', 'b'], status: 'open' })
  })

  it('is complete when every chosen task is done, whatever else is left', () => {
    const tasks = [makeOcc({ isMinimum: true, completion: 1 }), makeOcc({ isMinimum: true, completion: 1 }), makeOcc({ completion: 0 }), makeOcc({ completion: 0 })]
    expect(summarizeMinimum(tasks)).toMatchObject({ count: 2, done: 2, status: 'complete' })
  })

  it('does not count a chosen task that has been set aside', () => {
    const tasks = [makeOcc({ isMinimum: true, completion: 1 }), makeOcc({ isMinimum: true, planState: 'excluded', excludedReason: 'busy_day' })]
    expect(summarizeMinimum(tasks)).toMatchObject({ count: 1, status: 'complete' })
  })
})

describe('planMinimum', () => {
  const base = (extra = {}) => ({ planDate: TODAY, occurrences: mk(5), ...extra })

  it('allows 1 to 3 tasks and mirrors the limit in the shared configuration', () => {
    expect(PLANNER_CONFIG.limits.minimumTasks).toBe(3)
    expect(planMinimum({ ...base(), ids: ['m0'] }, ctx()).set).toEqual(['m0'])
    expect(planMinimum({ ...base(), ids: ['m0', 'm1', 'm2'] }, ctx()).set).toEqual(['m0', 'm1', 'm2'])
    expect(code(() => planMinimum({ ...base(), ids: ['m0', 'm1', 'm2', 'm3'] }, ctx()))).toBe(ERR.INVALID_ARGUMENT)
  })

  it('follows a configured limit', () => {
    const config = { limits: { ...PLANNER_CONFIG.limits, minimumTasks: 1 } }
    expect(code(() => planMinimum({ ...base(), ids: ['m0', 'm1'] }, ctx({ config })))).toBe(ERR.INVALID_ARGUMENT)
  })

  it('refuses the same task twice', () => {
    expect(code(() => planMinimum({ ...base(), ids: ['m0', 'm0'] }, ctx()))).toBe(ERR.INVALID_ARGUMENT)
  })

  it('refuses a task that is not on the day', () => {
    expect(code(() => planMinimum({ ...base(), ids: ['elsewhere'] }, ctx()))).toBe(ERR.INVALID_ARGUMENT)
  })

  it('refuses a task that has been set aside', () => {
    const occurrences = [makeOcc({ id: 'x', planState: 'excluded', excludedReason: 'busy_day' })]
    expect(code(() => planMinimum({ planDate: TODAY, occurrences, ids: ['x'] }, ctx()))).toBe(ERR.NOT_ACTIVE)
  })

  it('refuses a day that can no longer be edited', () => {
    expect(code(() => planMinimum({ ...base({ planDate: '2026-03-01' }), ids: ['m0'] }, ctx()))).toBe(ERR.DATE_NOT_EDITABLE)
  })

  it('refuses ids that are not a list', () => {
    expect(code(() => planMinimum({ ...base(), ids: 'm0' }, ctx()))).toBe(ERR.INVALID_ARGUMENT)
  })

  it('clears what is no longer chosen and sets only what is new, so the day never exceeds the limit part-way', () => {
    const occurrences = [...mk(3, { isMinimum: true }), makeOcc({ id: 'n1' })]
    const plan = planMinimum({ planDate: TODAY, occurrences, ids: ['m0', 'n1'] }, ctx())
    expect(plan).toEqual({ clear: ['m1', 'm2'], set: ['n1'] })
  })

  it('clears everything for an empty list, and does nothing when nothing is chosen', () => {
    const occurrences = [...mk(2, { isMinimum: true }), makeOcc({ id: 'n1' })]
    expect(planMinimum({ planDate: TODAY, occurrences, ids: [] }, ctx())).toEqual({ clear: ['m0', 'm1'], set: [] })
    expect(planMinimum({ ...base(), ids: [] }, ctx())).toEqual({ clear: [], set: [] })
  })

  it('does not change its inputs', () => {
    const occurrences = frozen(mk(3, { isMinimum: true }))
    expect(() => planMinimum({ planDate: TODAY, occurrences, ids: ['m0'] }, ctx())).not.toThrow()
  })
})

describe('Busy and Rest proposals leave the minimum alone', () => {
  const tasks = [makeOcc({ id: 'keep', isMinimum: true }), makeOcc({ id: 'other1' }), makeOcc({ id: 'other2', isPriority: true })]

  it('Busy proposes neither priority tasks nor the minimum', () => {
    expect(proposeSetAside({ mode: 'busy', occurrences: tasks }).ids).toEqual(['other1'])
  })

  it('Rest proposes every open task except the minimum', () => {
    expect(proposeSetAside({ mode: 'rest', occurrences: tasks }).ids).toEqual(['other1', 'other2'])
  })

  it('proposals are unchanged when no minimum is chosen', () => {
    const plain = tasks.map((t) => ({ ...t, isMinimum: false }))
    expect(proposeSetAside({ mode: 'busy', occurrences: plain }).ids).toEqual(['keep', 'other1'])
    expect(proposeSetAside({ mode: 'rest', occurrences: plain }).ids).toEqual(['keep', 'other1', 'other2'])
  })
})

// REGRESSION: choosing a minimum must not change a single progress figure. The same days, with and without minimum flags,
// must give identical results from every consumer of the progress engine.
describe('progress is exactly the same with or without a minimum', () => {
  const withFlags = (occurrences, flags) => occurrences.map((o, i) => ({ ...o, isMinimum: flags.includes(i) }))
  const scenarios = {
    'nothing done': [0, 0, 0, 0],
    'minimum done, the rest not': [1, 1, 0, 0],
    'half done': [0.5, 1, 0.5, 0],
    'everything done': [1, 1, 1, 1],
  }

  describe.each(Object.entries(scenarios))('%s', (_name, completions) => {
    const plain = completions.map((completion, i) => makeOcc({ id: `p${i}`, completion, completedAt: completion > 0 ? '2026-03-10T14:00:00.000Z' : null }))
    const flagged = withFlags(plain, [0, 1])
    const day = makeDay({ baselineAt: '2026-03-10T13:00:00.000Z' })

    it('gives the same day summary', () => {
      expect(summarizeDay({ day, occurrences: flagged })).toEqual(summarizeDay({ day, occurrences: plain }))
    })

    it('never makes the full day look more complete than the existing rules say', () => {
      const full = summarizeDay({ day, occurrences: flagged }).current
      const expectedUnits = completions.reduce((a, b) => a + b, 0)
      expect(full.percent).toBe(Math.round((expectedUnits / completions.length) * 100))
      if (completions.some((c) => c < 1)) expect(full.percent).toBeLessThan(100)
    })

    it('gives the same weekly summary', () => {
      const run = (occurrences) => summarizeWeek({ weekOf: TODAY, days: [{ day, occurrences }] }, ctx({ now: '2026-03-15T22:00:00Z' }))
      expect(run(flagged)).toEqual(run(plain))
    })

    it('gives the same recurring-task figures', () => {
      const templates = [{ id: 't1', title: 'Walk', recurrence: 'daily', weekdays: null, startsOn: '2026-03-01', endsOn: null, isPriority: false }]
      const tied = (occurrences) => occurrences.map((o, i) => ({ ...o, templateId: i === 0 ? 't1' : null }))
      const args = { templates, days: [day], from: '2026-03-01', to: TODAY }
      expect(summarizeHabits({ ...args, occurrences: tied(flagged) })).toEqual(summarizeHabits({ ...args, occurrences: tied(plain) }))
    })

    it('records the same progress in a snapshot', () => {
      expect(buildPlanSnapshot({ day, occurrences: flagged }).progress).toEqual(buildPlanSnapshot({ day, occurrences: plain }).progress)
    })

    it('reports the minimum separately and consistently', () => {
      const expected = completions[0] >= 1 && completions[1] >= 1 ? 'complete' : 'open'
      expect(summarizeMinimum(flagged).status).toBe(expected)
    })
  })

  it('completing the minimum changes only the completed tasks, not the other tasks or the day mode', () => {
    const day = makeDay()
    const tasks = [makeOcc({ id: 'a', isMinimum: true }), makeOcc({ id: 'b' })]
    const result = setCompletion({ occurrence: tasks[0], day, value: 1 }, ctx())
    expect(result.occurrence).toMatchObject({ id: 'a', completion: 1, isMinimum: true })
    expect(tasks[1]).toMatchObject({ completion: 0, planState: 'active' })
    expect(result.day.dayMode).toBe('normal')
  })

  it('setting a chosen task aside leaves the others untouched', () => {
    const day = makeDay()
    const result = setAside({ occurrence: makeOcc({ id: 'a', isMinimum: true }), day, reason: 'busy_day' }, ctx())
    expect(result.occurrence.planState).toBe('excluded')
  })
})
