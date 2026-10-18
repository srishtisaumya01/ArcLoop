import { describe, it, expect } from 'vitest'
import { challengeClock } from '../../src/utils/challengeClock.js'

const WINTER_ARC = { startDate: '2026-10-01', totalDays: 90 }

describe('challengeClock', () => {
  it('counts the first day as day 1, so 18 October is day 18 of a challenge that began on 1 October', () => {
    const c = challengeClock(WINTER_ARC, new Date(2026, 9, 18, 13, 0, 0))
    expect(c).toMatchObject({ status: 'live', dayNumber: 18, totalDays: 90, daysLeft: 72 })
    expect(c.progress).toBeCloseTo(0.2)
  })

  it('is on day 1 all of the first day and on day 90 all of the last day', () => {
    expect(challengeClock(WINTER_ARC, new Date(2026, 9, 1, 0, 0, 0)).dayNumber).toBe(1)
    expect(challengeClock(WINTER_ARC, new Date(2026, 9, 1, 23, 59, 59)).dayNumber).toBe(1)
    const last = challengeClock(WINTER_ARC, new Date(2026, 11, 29, 12, 0, 0))
    expect(last).toMatchObject({ status: 'live', dayNumber: 90, daysLeft: 0 })
    expect(last.lastDay.getDate()).toBe(29)
  })

  it('counts down to midnight at the end of the last day', () => {
    const c = challengeClock(WINTER_ARC, new Date(2026, 11, 29, 22, 59, 30))
    expect(c.parts).toEqual({ days: 0, hours: 1, minutes: 0, seconds: 30 })
    const early = challengeClock(WINTER_ARC, new Date(2026, 9, 18, 13, 0, 0))
    expect(early.parts.days).toBe(72)
    expect(early.parts.hours).toBe(11)
  })

  it('knows when a challenge has not started and when it is over', () => {
    const before = challengeClock(WINTER_ARC, new Date(2026, 8, 28, 12, 0, 0))
    expect(before).toMatchObject({ status: 'upcoming', dayNumber: 0 })
    expect(before.parts.days).toBe(2)
    expect(challengeClock(WINTER_ARC, new Date(2026, 11, 30, 0, 0, 0))).toMatchObject({ status: 'ended', dayNumber: 90, daysLeft: 0 })
  })
})
