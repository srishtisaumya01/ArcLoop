import { describe, expect, it } from 'vitest'
import { RECOVERY_LOOKBACK_DAYS, isMissedPlannedDay, missedDaysInWeek, recoveryStatus, summarizeDay, summarizeWeek } from '../../../src/utils/planner/index.js'
import { WEEK_NOTE, WELCOME_BACK } from '../../../src/constants/recoveryCopy.js'
import { ctx, frozen, makeDay, makeOcc } from './fixtures.js'

// Today is Tuesday 2026-03-10 (fixed clock).
const TODAY = '2026-03-10'
const D = (n) => `2026-03-${String(n).padStart(2, '0')}`
const rec = (planDate, completions, dayMode = 'normal') => ({
  day: makeDay({ planDate, dayMode }),
  occurrences: completions.map((completion) => makeOcc({ planDate, completion })),
})
const status = (records, over) => recoveryStatus({ records: frozen(records), today: TODAY, ...over })

describe('recoveryStatus: when someone is returning after a missed planned day', () => {
  it('is returning when the last planned day had a plan and no progress', () => {
    expect(status([rec(D(9), [0, 0])])).toEqual({ returning: true, missedDates: [D(9)], lastPlannedDate: D(9) })
  })

  it('is not returning when the last planned day had any progress, even partial', () => {
    expect(status([rec(D(9), [1, 0])]).returning).toBe(false)
    expect(status([rec(D(9), [0.5])]).returning).toBe(false)
  })

  it('never infers a missed day from a date with no plan', () => {
    expect(status([])).toEqual({ returning: false, missedDates: [], lastPlannedDate: null })
    // Yesterday has no record at all; the last day that was planned was completed.
    expect(status([rec(D(6), [1])]).returning).toBe(false)
  })

  it('looks past dates with no plan to the last planned day', () => {
    // 6 and 7 March were never planned; 5 March was planned and left untouched.
    expect(status([rec(D(5), [0])])).toMatchObject({ returning: true, missedDates: [D(5)] })
  })

  it('ignores rest days, empty days and days where every task was set aside', () => {
    const asideOnly = { day: makeDay({ planDate: D(8) }), occurrences: [makeOcc({ planDate: D(8), planState: 'excluded', excludedReason: 'busy_day' })] }
    expect(status([rec(D(9), [0], 'rest'), asideOnly, rec(D(7), [])]).returning).toBe(false)
    // A rest day yesterday does not hide an older unfinished planned day.
    expect(status([rec(D(7), [0]), rec(D(9), [0], 'rest')])).toMatchObject({ returning: true, missedDates: [D(7)] })
  })

  it('counts a busy day with no progress (busy is still a planned day)', () => {
    expect(status([rec(D(9), [0], 'busy')]).returning).toBe(true)
  })

  it('returns the unbroken run of unfinished planned days, oldest first, and stops at progress', () => {
    const records = [rec(D(5), [0]), rec(D(6), [1]), rec(D(7), [0]), rec(D(8), []), rec(D(9), [0, 0])]
    expect(status(records)).toMatchObject({ returning: true, missedDates: [D(7), D(9)], lastPlannedDate: D(9) })
  })

  it('is not returning once anything has been done today, and ignores today\'s own pending tasks', () => {
    expect(status([rec(D(9), [0]), rec(TODAY, [0.5, 0])]).returning).toBe(false)
    expect(status([rec(D(9), [0]), rec(TODAY, [0, 0])]).returning).toBe(true) // today is not over; it is not a missed day
    expect(status([rec(TODAY, [0, 0])]).returning).toBe(false)
  })

  it('only looks back a limited number of days, and ignores the future', () => {
    expect(RECOVERY_LOOKBACK_DAYS).toBe(28)
    expect(status([rec('2026-02-10', [0])]).returning).toBe(false) // 28 days ago is outside 11 Feb to 10 Mar
    expect(status([rec('2026-02-11', [0])]).returning).toBe(true) // the first day inside
    expect(status([rec(D(12), [0])]).returning).toBe(false)
    expect(status([rec(D(9), [0])], { lookbackDays: 1 }).returning).toBe(false)
  })

  it('does not change its input', () => {
    expect(() => status([rec(D(9), [0])])).not.toThrow()
  })
})

describe('isMissedPlannedDay', () => {
  const summary = (completions, mode = 'normal') => summarizeDay(rec(D(9), completions, mode))
  it('needs a past, planned, non-rest day without any progress', () => {
    expect(isMissedPlannedDay(summary([0]), D(9), TODAY)).toBe(true)
    expect(isMissedPlannedDay(summary([0.5]), D(9), TODAY)).toBe(false)
    expect(isMissedPlannedDay(summary([0], 'rest'), D(9), TODAY)).toBe(false)
    expect(isMissedPlannedDay(summary([]), D(9), TODAY)).toBe(false)
    expect(isMissedPlannedDay(summary([0]), TODAY, TODAY)).toBe(false) // today is not over
    expect(isMissedPlannedDay(summary([0]), D(11), TODAY)).toBe(false)
  })
})

describe('missedDaysInWeek', () => {
  // Week of Monday 9 March (today is Tuesday 10 March).
  const week = (records) => summarizeWeek({ days: frozen(records) }, ctx())

  it('lists past planned days with no progress, and not today, rest days, empty days or future days', () => {
    expect(missedDaysInWeek(week([rec(D(9), [0, 0]), rec(TODAY, [0])]))).toEqual([D(9)])
    expect(missedDaysInWeek(week([rec(D(9), [0], 'rest'), rec(TODAY, [0]), rec(D(11), [0])]))).toEqual([])
    expect(missedDaysInWeek(week([rec(D(9), [1, 0])]))).toEqual([]) // some progress
    expect(missedDaysInWeek(week([]))).toEqual([]) // nothing planned is not a missed day
  })

  it('is empty for a week that has not started yet, and finds days in an earlier week', () => {
    expect(missedDaysInWeek(summarizeWeek({ weekOf: D(16), days: [] }, ctx()))).toEqual([])
    const earlier = summarizeWeek({ weekOf: D(2), days: frozen([rec(D(3), [0]), rec(D(4), [1])]) }, ctx())
    expect(missedDaysInWeek(earlier)).toEqual([D(3)])
  })
})

describe('approved wording', () => {
  it('is exactly as approved and applies no pressure', () => {
    expect(WELCOME_BACK).toEqual({
      heading: 'Welcome back.',
      message: "You don't have to make up for yesterday. Start with what feels manageable today.",
      supporting: 'Pick up where you are. Your past days are still part of your journey.',
    })
    expect(WEEK_NOTE).toEqual({
      heading: 'Every week is a fresh opportunity.',
      message: "Some days don't go as planned. That's okay. Look at what worked, then choose your next step.",
    })
    expect(JSON.stringify([WELCOME_BACK, WEEK_NOTE])).not.toMatch(/\d/) // no counts or dates
  })
})
