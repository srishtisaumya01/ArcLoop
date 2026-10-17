import { describe, expect, it } from 'vitest'
import {
  COMPLETION_VALUES,
  ERR,
  PlannerError,
  assertCompletion,
  isPlanRevised,
  isValidCompletion,
  percentFromUnits,
  remainingOccurrences,
  summarizeDay,
  summarizeProgress,
} from '../../../src/utils/planner/index.js'
import { frozen, makeDay, makeOcc } from './fixtures.js'

const code = (fn) => {
  try {
    fn()
  } catch (e) {
    return e instanceof PlannerError ? e.code : `non-planner:${e.name}`
  }
  return null
}
const occ = (completion, extra = {}) => makeOcc({ completion, ...extra })

describe('completion values (D1): 0, 0.5 and 1 only', () => {
  it('accepts exactly the three values', () => {
    expect(COMPLETION_VALUES).toEqual([0, 0.5, 1])
    for (const v of [0, 0.5, 1]) {
      expect(isValidCompletion(v)).toBe(true)
      expect(code(() => assertCompletion(v))).toBeNull()
    }
  })

  it('rejects everything else', () => {
    for (const bad of [0.25, 0.75, 0.1, -0.5, 1.5, 2, -1, '1', '0.5', null, undefined, NaN, Infinity, true, [], {}]) {
      expect(isValidCompletion(bad), String(bad)).toBe(false)
      expect(code(() => assertCompletion(bad)), String(bad)).toBe(ERR.INVALID_COMPLETION)
    }
  })

  it('a partially completed task contributes 0.5 units', () => {
    expect(summarizeProgress([occ(0.5)]).units).toBe(0.5)
    expect(summarizeProgress([occ(0.5)]).percent).toBe(50)
  })

  it('summarising an occurrence with an invalid completion fails loudly', () => {
    expect(code(() => summarizeProgress([occ(0.3)]))).toBe(ERR.INVALID_COMPLETION)
  })
})

describe('percentFromUnits', () => {
  it('returns null (never 0, never NaN) when there are no tasks', () => {
    expect(percentFromUnits(0, 0)).toBeNull()
  })

  it('computes the documented examples', () => {
    expect(percentFromUnits(3.5, 6)).toBe(58) // 3 done + 1 partial of 6
    expect(percentFromUnits(2, 3)).toBe(67)
    expect(percentFromUnits(2, 6)).toBe(33)
    expect(percentFromUnits(1, 3)).toBe(33)
    expect(percentFromUnits(0.5, 1)).toBe(50)
    expect(percentFromUnits(0, 5)).toBe(0)
  })

  it('rounds half up', () => {
    expect(percentFromUnits(1, 8)).toBe(13) // 12.5
    expect(percentFromUnits(3, 8)).toBe(38) // 37.5
    expect(percentFromUnits(0.5, 8)).toBe(6) // 6.25
    expect(percentFromUnits(1, 6)).toBe(17) // 16.67
  })

  it('shows 100 only when every unit is complete', () => {
    expect(percentFromUnits(6, 6)).toBe(100)
    expect(percentFromUnits(199.5, 200)).toBe(99) // 99.75 would round to 100
    expect(percentFromUnits(99.5, 100)).toBe(99)
    expect(percentFromUnits(1999.5, 2000)).toBe(99)
  })

  it('shows at least 1 for any progress', () => {
    expect(percentFromUnits(0.5, 100)).toBe(1) // 0.5
    expect(percentFromUnits(0.5, 1000)).toBe(1)
    expect(percentFromUnits(0, 1000)).toBe(0)
  })

  it('rejects invalid arguments', () => {
    expect(code(() => percentFromUnits(1, -1))).toBe(ERR.INVALID_ARGUMENT)
    expect(code(() => percentFromUnits(1, 1.5))).toBe(ERR.INVALID_ARGUMENT)
    expect(code(() => percentFromUnits(0.3, 4))).toBe(ERR.INVALID_ARGUMENT)
    expect(code(() => percentFromUnits(-1, 4))).toBe(ERR.INVALID_ARGUMENT)
    expect(code(() => percentFromUnits(5, 4))).toBe(ERR.INVALID_ARGUMENT)
  })

  it('is always an integer from 0 to 100, monotonic, and never NaN, for every small plan', () => {
    for (let count = 1; count <= 40; count += 1) {
      let previous = -1
      for (let halves = 0; halves <= 2 * count; halves += 1) {
        const p = percentFromUnits(halves / 2, count)
        expect(Number.isInteger(p)).toBe(true)
        expect(p).toBeGreaterThanOrEqual(0)
        expect(p).toBeLessThanOrEqual(100)
        expect(p).toBeGreaterThanOrEqual(previous)
        if (halves < 2 * count) expect(p).toBeLessThan(100)
        if (halves > 0) expect(p).toBeGreaterThanOrEqual(1)
        previous = p
      }
    }
  })
})

describe('summarizeProgress', () => {
  it('handles an empty plan explicitly', () => {
    expect(summarizeProgress([])).toEqual({ count: 0, units: 0, percent: null, done: 0, partial: 0, pending: 0 })
  })

  it('counts done, partial and pending (the 6-task example)', () => {
    const s = summarizeProgress([occ(1), occ(1), occ(1), occ(0.5), occ(0), occ(0)])
    expect(s).toEqual({ count: 6, units: 3.5, percent: 58, done: 3, partial: 1, pending: 2 })
  })

  it('all done is 100 and all pending is 0', () => {
    expect(summarizeProgress([occ(1), occ(1)]).percent).toBe(100)
    expect(summarizeProgress([occ(0), occ(0)]).percent).toBe(0)
  })
})

describe('denominators: current plan vs original plan', () => {
  it('excludes set-aside tasks from the current plan but keeps them in the original', () => {
    const day = makeDay({ dayMode: 'busy', baselineAt: '2026-03-10T09:00:00.000Z' })
    const occurrences = [
      occ(1), occ(1), occ(0),
      occ(0, { planState: 'excluded', excludedReason: 'busy_day' }),
      occ(0, { planState: 'excluded', excludedReason: 'busy_day' }),
      occ(0, { planState: 'excluded', excludedReason: 'busy_day' }),
    ]
    const s = summarizeDay({ day, occurrences: frozen(occurrences) })
    expect(s.current).toMatchObject({ count: 3, units: 2, percent: 67 })
    expect(s.original).toMatchObject({ count: 6, units: 2, percent: 33 })
    expect(s.revised).toBe(true)
    expect(s.setAsideCount).toBe(3)
  })

  it('tasks added after the baseline count only in the current plan', () => {
    const day = makeDay({ baselineAt: '2026-03-10T09:00:00.000Z' })
    const occurrences = [occ(1), occ(0), occ(1, { inOriginalPlan: false })]
    const s = summarizeDay({ day, occurrences })
    expect(s.current).toMatchObject({ count: 3, units: 2, percent: 67 })
    expect(s.original).toMatchObject({ count: 2, units: 1, percent: 50 })
  })

  it('a rescheduled task leaves the revised plan but stays in the original at its own progress', () => {
    const day = makeDay({ baselineAt: '2026-03-10T09:00:00.000Z' })
    const moved = occ(0, { planState: 'excluded', excludedReason: 'rescheduled' })
    const s = summarizeDay({ day, occurrences: [occ(1), moved] })
    expect(s.current).toMatchObject({ count: 1, percent: 100 })
    expect(s.original).toMatchObject({ count: 2, units: 1, percent: 50 })
  })

  it('a partially completed set-aside task keeps its 0.5 in the original plan only (C2)', () => {
    const day = makeDay({ baselineAt: '2026-03-10T09:00:00.000Z', dayMode: 'busy' })
    const half = occ(0.5, { planState: 'excluded', excludedReason: 'busy_day' })
    const s = summarizeDay({ day, occurrences: [occ(1), half] })
    expect(s.current).toMatchObject({ count: 1, units: 1 })
    expect(s.original).toMatchObject({ count: 2, units: 1.5, percent: 75 })
  })

  it('the original figure is hidden until the plan has been revised', () => {
    const day = makeDay()
    const s = summarizeDay({ day, occurrences: [occ(1), occ(0)] })
    expect(s.revised).toBe(false)
    expect(s.original).toBeNull()
  })

  it('a tick after the baseline alone is not a revision', () => {
    const day = makeDay({ baselineAt: '2026-03-10T09:00:00.000Z' })
    expect(isPlanRevised(day, [occ(1)])).toBe(false)
  })

  it('a day mode other than normal is a revision even with no set-aside tasks', () => {
    expect(isPlanRevised(makeDay({ dayMode: 'busy' }), [occ(0)])).toBe(true)
    expect(isPlanRevised(makeDay({ dayMode: 'rest' }), [occ(0)])).toBe(true)
  })

  it('never mutates its input', () => {
    const day = frozen(makeDay())
    const list = frozen([occ(1), occ(0.5)])
    expect(() => summarizeDay({ day, occurrences: list })).not.toThrow()
  })
})

describe('zero-task days', () => {
  it('an empty normal day has no percentage', () => {
    const s = summarizeDay({ day: makeDay(), occurrences: [] })
    expect(s.kind).toBe('empty')
    expect(s.current.percent).toBeNull()
    expect(s.original).toBeNull()
    expect(s.remainingCount).toBe(0)
  })

  it('a day where everything was set aside has no percentage either (not 0%)', () => {
    const day = makeDay({ dayMode: 'busy', baselineAt: '2026-03-10T09:00:00.000Z' })
    const s = summarizeDay({ day, occurrences: [occ(0, { planState: 'excluded', excludedReason: 'busy_day' })] })
    expect(s.kind).toBe('empty')
    expect(s.current.percent).toBeNull()
    expect(s.original.percent).toBe(0)
  })
})

describe('rest days (D12)', () => {
  it('are identifiable as rest days even when they contain tasks', () => {
    const day = makeDay({ dayMode: 'rest', baselineAt: '2026-03-10T09:00:00.000Z' })
    const s = summarizeDay({ day, occurrences: [occ(0.5), occ(0)] })
    expect(s.isRestDay).toBe(true)
    expect(s.kind).toBe('rest')
    expect(s.current).toMatchObject({ count: 2, units: 0.5, percent: 25 }) // progress stays visible
  })

  it('an empty rest day is a rest day, not an empty day', () => {
    expect(summarizeDay({ day: makeDay({ dayMode: 'rest' }), occurrences: [] }).kind).toBe('rest')
  })
})

describe('remaining tasks', () => {
  it('counts active tasks that are not done, including partial ones', () => {
    const list = [occ(1), occ(0.5), occ(0), occ(0, { planState: 'excluded', excludedReason: 'removed' })]
    expect(remainingOccurrences(list)).toHaveLength(2)
    expect(summarizeDay({ day: makeDay(), occurrences: list }).remainingCount).toBe(2)
  })
})
