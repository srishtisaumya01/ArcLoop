import { describe, expect, it } from 'vitest'
import { ERR, PlannerError, summarizeWeek } from '../../../src/utils/planner/index.js'
import { ctx, frozen, makeDay, makeOcc } from './fixtures.js'

const code = (fn) => {
  try {
    fn()
  } catch (e) {
    return e instanceof PlannerError ? e.code : `non-planner:${e.name}`
  }
  return null
}

// Week of Monday 2026-03-09 .. Sunday 2026-03-15 (New York).
const SUNDAY_EVENING = ctx({ now: '2026-03-15T22:00:00Z' }) // Sunday 18:00 EDT: every day of the week has happened
const MON = '2026-03-09'
const TUE = '2026-03-10'
const WED = '2026-03-11'
const THU = '2026-03-12'
const FRI = '2026-03-13'

// A day record with the given completion values for its tasks.
function rec(planDate, completions, { mode = 'normal', baselineAt = null, extra = [] } = {}) {
  const day = makeDay({ planDate, dayMode: mode, baselineAt })
  const occurrences = [
    ...completions.map((completion) => makeOcc({ planDate, completion, completedAt: completion > 0 ? `${planDate}T12:00:00.000Z` : null })),
    ...extra,
  ]
  return { day, occurrences }
}

describe('Monday-to-Sunday weeks in the user\'s local calendar (D8)', () => {
  it('spans Monday to Sunday', () => {
    const w = summarizeWeek({ days: [] }, SUNDAY_EVENING)
    expect(w.weekStart).toBe(MON)
    expect(w.weekEnd).toBe('2026-03-15')
    expect(w.days.map((d) => d.date)).toEqual([MON, TUE, WED, THU, FRI, '2026-03-14', '2026-03-15'])
  })

  it('Sunday belongs to the week that started the previous Monday', () => {
    expect(summarizeWeek({ days: [] }, SUNDAY_EVENING).weekStart).toBe(MON)
    // Monday 00:00 New York (04:00Z during daylight time) starts a new week.
    const w = summarizeWeek({ days: [] }, ctx({ now: '2026-03-16T04:00:00Z' }))
    expect(w.weekStart).toBe('2026-03-16')
    expect(w.weekEnd).toBe('2026-03-22')
  })

  it('uses the profile timezone to decide which week "today" is in', () => {
    const now = '2026-03-16T02:00:00Z' // still Sunday in New York, already Monday in Kolkata
    expect(summarizeWeek({ days: [] }, { now, timeZone: 'America/New_York' }).weekStart).toBe(MON)
    expect(summarizeWeek({ days: [] }, { now, timeZone: 'Asia/Kolkata' }).weekStart).toBe('2026-03-16')
  })

  it('crosses the year boundary', () => {
    const now = '2027-01-02T20:00:00Z' // Saturday
    const w = summarizeWeek({ days: [rec('2026-12-31', [1]), rec('2027-01-01', [1, 0])] }, ctx({ now }))
    expect(w.weekStart).toBe('2026-12-28')
    expect(w.weekEnd).toBe('2027-01-03')
    expect(w.plannedDays).toBe(2)
    expect(w.daysWithProgress).toBe(2)
  })

  it('can summarise a past week with weekOf', () => {
    const w = summarizeWeek({ weekOf: '2026-03-04', days: [rec('2026-03-04', [1])] }, SUNDAY_EVENING)
    expect(w.weekStart).toBe('2026-03-02')
    expect(w.days[2]).toMatchObject({ date: '2026-03-04', kind: 'planned', percent: 100 })
  })

  it('ignores records from other weeks', () => {
    const w = summarizeWeek({ days: [rec('2026-03-02', [1]), rec(TUE, [1])] }, SUNDAY_EVENING)
    expect(w.plannedDays).toBe(1)
  })
})

describe('day kinds: never counting an unopened day as zero', () => {
  it('marks days that have not happened yet as upcoming, even if planned ahead', () => {
    const now = ctx() // Tuesday 2026-03-10
    const w = summarizeWeek({ days: [rec(TUE, [1]), rec(THU, [0, 0])] }, now)
    expect(w.days.map((d) => d.kind)).toEqual(['no_record', 'planned', 'no_record', 'upcoming', 'upcoming', 'upcoming', 'upcoming'].map((k, i) => (i === 2 ? 'upcoming' : k)))
    expect(w.plannedDays).toBe(1) // Thursday's plan-ahead is not counted
  })

  it('days without a record are "no_record" and never enter the average (today, not over yet, is "upcoming")', () => {
    const w = summarizeWeek({ days: [rec(MON, [1])] }, SUNDAY_EVENING)
    expect(w.days.filter((d) => d.kind === 'no_record')).toHaveLength(5) // Tuesday to Saturday
    expect(w.days[6]).toMatchObject({ date: '2026-03-15', kind: 'upcoming', plannedCount: 0 }) // Sunday is today and not opened
    expect(w.averagePercent).toBe(100)
  })

  it('a day with a record but no active tasks is "empty": not planned, not counted', () => {
    const w = summarizeWeek({ days: [rec(MON, []), rec(TUE, [1])] }, SUNDAY_EVENING)
    expect(w.days[0].kind).toBe('empty')
    expect(w.days[0].percent).toBeNull()
    expect(w.plannedDays).toBe(1)
    expect(w.daysWithPlan).toBe(1)
    expect(w.averagePercent).toBe(100)
  })
})

describe('days with progress (D9: no streak)', () => {
  it('counts days whose active tasks have more than zero completion units', () => {
    const w = summarizeWeek({ days: [rec(MON, [0.5, 0]), rec(TUE, [0, 0]), rec(WED, [1])] }, SUNDAY_EVENING)
    expect(w.daysWithProgress).toBe(2)
    expect(w.plannedDays).toBe(3)
  })

  it('is a different number from the days with a plan', () => {
    const w = summarizeWeek({ days: [rec(MON, [0]), rec(TUE, [0]), rec(WED, [1])] }, SUNDAY_EVENING)
    expect(w.daysWithPlan).toBe(3)
    expect(w.daysWithProgress).toBe(1)
  })

  it('does not count progress that sits only on set-aside tasks', () => {
    const asideHalf = makeOcc({ planDate: MON, completion: 0.5, planState: 'excluded', excludedReason: 'busy_day' })
    const day = makeDay({ planDate: MON, dayMode: 'busy', baselineAt: '2026-03-09T09:00:00.000Z' })
    const w = summarizeWeek({ days: [{ day, occurrences: [asideHalf, makeOcc({ planDate: MON, completion: 0 })] }] }, SUNDAY_EVENING)
    expect(w.daysWithProgress).toBe(0)
  })

  it('a missed day never lowers anything: the other days are untouched', () => {
    const withGap = summarizeWeek({ days: [rec(MON, [1]), rec(WED, [1])] }, SUNDAY_EVENING)
    const noGap = summarizeWeek({ days: [rec(MON, [1]), rec(TUE, [1]), rec(WED, [1])] }, SUNDAY_EVENING)
    expect(withGap.daysWithProgress).toBe(2)
    expect(withGap.averagePercent).toBe(noGap.averagePercent)
  })

  it('has no streak anywhere in its output', () => {
    const w = summarizeWeek({ days: [rec(MON, [1]), rec(TUE, [1])] }, SUNDAY_EVENING)
    expect(JSON.stringify(w)).not.toMatch(/streak/i)
  })
})

describe('rest days (D12)', () => {
  const restWithProgress = rec(WED, [1, 0], { mode: 'rest', baselineAt: '2026-03-11T09:00:00.000Z' })

  it('are shown explicitly', () => {
    const w = summarizeWeek({ days: [restWithProgress] }, SUNDAY_EVENING)
    expect(w.days[2]).toMatchObject({ kind: 'rest', isRestDay: true, percent: 50 }) // progress stays visible
    expect(w.restDays).toBe(1)
  })

  it('their progress counts toward days with progress', () => {
    expect(summarizeWeek({ days: [restWithProgress] }, SUNDAY_EVENING).daysWithProgress).toBe(1)
  })

  it('but they are excluded from the average', () => {
    const w = summarizeWeek({ days: [rec(MON, [1]), restWithProgress] }, SUNDAY_EVENING)
    expect(w.averagePercent).toBe(100) // Monday only; the 50% rest day is not averaged in
    expect(w.plannedDays).toBe(1)
  })

  it('an empty rest day has no progress but still counts as a day with a plan', () => {
    const emptyRest = rec(WED, [], { mode: 'rest', baselineAt: '2026-03-11T09:00:00.000Z' })
    const w = summarizeWeek({ days: [emptyRest] }, SUNDAY_EVENING)
    expect(w.daysWithProgress).toBe(0)
    expect(w.daysWithPlan).toBe(1)
    expect(w.restDays).toBe(1)
    expect(w.averagePercent).toBeNull()
  })

  it('a week of only rest days has no average (null, not 0)', () => {
    const w = summarizeWeek({ days: [rec(MON, [0], { mode: 'rest' }), rec(TUE, [], { mode: 'rest' })] }, SUNDAY_EVENING)
    expect(w.averagePercent).toBeNull()
    expect(w.plannedDays).toBe(0)
  })
})

describe('average completion: arithmetic mean over planned, non-rest days', () => {
  it('averages the exact daily percentages', () => {
    // 1 of 3 = 33.33%, 1 of 2 = 50% -> mean 41.67 -> 42
    const w = summarizeWeek({ days: [rec(MON, [1, 0, 0]), rec(TUE, [1, 0])] }, SUNDAY_EVENING)
    expect(w.averagePercent).toBe(42)
  })

  it('gives each day equal weight regardless of its task count', () => {
    // Day A: 1 task done (100%). Day B: 10 tasks, none done (0%). Mean 50, not 1/11.
    const w = summarizeWeek({ days: [rec(MON, [1]), rec(TUE, new Array(10).fill(0))] }, SUNDAY_EVENING)
    expect(w.averagePercent).toBe(50)
  })

  it('includes a planned day with no progress as 0% (it was planned and happened)', () => {
    const w = summarizeWeek({ days: [rec(MON, [1]), rec(TUE, [0])] }, SUNDAY_EVENING)
    expect(w.averagePercent).toBe(50)
  })

  it('counts partial completion as 0.5', () => {
    expect(summarizeWeek({ days: [rec(MON, [0.5, 0.5])] }, SUNDAY_EVENING).averagePercent).toBe(50)
  })

  it('is 100 only when every planned day is fully complete', () => {
    expect(summarizeWeek({ days: [rec(MON, [1, 1]), rec(TUE, [1])] }, SUNDAY_EVENING).averagePercent).toBe(100)
    const big = new Array(200).fill(1)
    big[0] = 0.5
    expect(summarizeWeek({ days: [rec(MON, big)] }, SUNDAY_EVENING).averagePercent).toBe(99) // 99.75 must not show as 100
  })

  it('shows at least 1 for any progress at all', () => {
    const tiny = new Array(100).fill(0)
    tiny[0] = 0.5
    expect(summarizeWeek({ days: [rec(MON, tiny)] }, SUNDAY_EVENING).averagePercent).toBe(1)
  })

  it('uses the revised (current) plan of a revised day', () => {
    const day = makeDay({ planDate: MON, dayMode: 'busy', baselineAt: '2026-03-09T09:00:00.000Z' })
    const occurrences = [
      makeOcc({ planDate: MON, completion: 1 }),
      makeOcc({ planDate: MON, completion: 0, planState: 'excluded', excludedReason: 'busy_day' }),
    ]
    const w = summarizeWeek({ days: [{ day, occurrences }] }, SUNDAY_EVENING)
    expect(w.days[0]).toMatchObject({ kind: 'planned', percent: 100, revised: true })
    expect(w.averagePercent).toBe(100)
  })

  it('is null with no planned days (explicit zero-task handling)', () => {
    expect(summarizeWeek({ days: [] }, SUNDAY_EVENING).averagePercent).toBeNull()
  })
})

describe('weekly summary eligibility (at least 3 days with a plan)', () => {
  it('is false with 2 days and true with 3', () => {
    expect(summarizeWeek({ days: [rec(MON, [1]), rec(TUE, [1])] }, SUNDAY_EVENING).eligible).toBe(false)
    expect(summarizeWeek({ days: [rec(MON, [1]), rec(TUE, [1]), rec(WED, [1])] }, SUNDAY_EVENING).eligible).toBe(true)
  })

  it('counts rest days as days with a plan', () => {
    const w = summarizeWeek({ days: [rec(MON, [1]), rec(TUE, [1]), rec(WED, [], { mode: 'rest' })] }, SUNDAY_EVENING)
    expect(w.daysWithPlan).toBe(3)
    expect(w.eligible).toBe(true)
  })

  it('does not count empty or unopened days', () => {
    const w = summarizeWeek({ days: [rec(MON, [1]), rec(TUE, [1]), rec(WED, [])] }, SUNDAY_EVENING)
    expect(w.eligible).toBe(false)
  })

  it('is about plans, not progress: three planned days without any progress are eligible', () => {
    const w = summarizeWeek({ days: [rec(MON, [0]), rec(TUE, [0]), rec(WED, [0])] }, SUNDAY_EVENING)
    expect(w.daysWithProgress).toBe(0)
    expect(w.eligible).toBe(true)
  })

  it('does not count planned-ahead days', () => {
    const now = ctx({ now: '2026-03-11T16:00:00Z' }) // Wednesday
    const w = summarizeWeek({ days: [rec(MON, [1]), rec(WED, [1]), rec(THU, [0]), rec(FRI, [0])] }, now)
    expect(w.daysWithPlan).toBe(2)
    expect(w.eligible).toBe(false)
  })

  it('the threshold is configurable', () => {
    const cfg = { ...SUNDAY_EVENING, config: { minPlannedDaysForWeeklySummary: 1 } }
    expect(summarizeWeek({ days: [rec(MON, [1])] }, cfg).eligible).toBe(true)
  })
})

describe('totals and validation', () => {
  it('totals done and partial tasks across counted days, including rest days', () => {
    const w = summarizeWeek({ days: [rec(MON, [1, 1, 0.5]), rec(WED, [1, 0.5], { mode: 'rest' })] }, SUNDAY_EVENING)
    expect(w.tasksDone).toBe(3)
    expect(w.tasksPartial).toBe(2)
  })

  it('rejects two plans for the same date', () => {
    expect(code(() => summarizeWeek({ days: [rec(MON, [1]), rec(MON, [0])] }, SUNDAY_EVENING))).toBe(ERR.INVALID_ARGUMENT)
  })

  it('does not mutate its input', () => {
    expect(() => summarizeWeek({ days: frozen([rec(MON, [1, 0.5])]) }, SUNDAY_EVENING)).not.toThrow()
  })
})
