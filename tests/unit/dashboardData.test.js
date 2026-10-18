import { describe, it, expect } from 'vitest'
import { isBrandNew, summarizeToday, topHabits, trendPoints, weekBars } from '../../src/utils/dashboard.js'

const day = (date, over = {}) => ({ date, kind: 'no_record', tasks: [], ...over })
const week = (over = {}) => ({
  weekStart: '2026-10-12',
  today: '2026-10-14',
  days: [
    day('2026-10-12', { kind: 'planned', count: 4, done: 3, partial: 0, remaining: 1, percent: 75 }),
    day('2026-10-13', { kind: 'rest' }),
    day('2026-10-14', { kind: 'planned', count: 5, done: 2, partial: 1, remaining: 3, percent: 50, tasks: [{ id: 'a', title: 'Walk', completion: 1 }] }),
    day('2026-10-15', { kind: 'upcoming', plannedCount: 2, tasks: [{}, {}] }),
    day('2026-10-16'), day('2026-10-17'), day('2026-10-18'),
  ],
  ...over,
})

describe('summarizeToday', () => {
  it('reads today from a recorded day', () => {
    expect(summarizeToday(week())).toMatchObject({ kind: 'planned', count: 5, done: 2, partial: 1, left: 3, percent: 50 })
  })
  it('treats today before it has a record as planned work with nothing done', () => {
    const w = week()
    w.days[2] = day('2026-10-14', { kind: 'upcoming', plannedCount: 3, tasks: [{}, {}, {}] })
    expect(summarizeToday(w)).toMatchObject({ kind: 'planned', count: 3, done: 0, left: 3, percent: 0 })
  })
  it('knows a rest day and an empty day', () => {
    const rest = week(); rest.days[2] = day('2026-10-14', { kind: 'rest' })
    expect(summarizeToday(rest).kind).toBe('rest')
    const empty = week(); empty.days[2] = day('2026-10-14', { kind: 'empty' })
    expect(summarizeToday(empty)).toMatchObject({ kind: 'empty', count: 0 })
    expect(summarizeToday(null)).toBeNull()
  })
})

describe('weekBars', () => {
  it('gives seven entries with percents for recorded days and counts for coming ones', () => {
    const bars = weekBars(week())
    expect(bars).toHaveLength(7)
    expect(bars[0]).toMatchObject({ percent: 75, isToday: false })
    expect(bars[1]).toMatchObject({ isRest: true, percent: null })
    expect(bars[2]).toMatchObject({ isToday: true, percent: 50 })
    expect(bars[3]).toMatchObject({ percent: null, planned: 2 })
  })
})

describe('trendPoints', () => {
  it('lists the weeks that have an average, oldest first', () => {
    const weeks = [
      { weekStart: '2026-10-12', eligible: true, averagePercent: 70 },
      { weekStart: '2026-10-05', eligible: false, averagePercent: 40 },
      { weekStart: '2026-09-28', eligible: true, averagePercent: 55 },
      { weekStart: '2026-09-21', eligible: true, averagePercent: null },
    ]
    expect(trendPoints(weeks)).toEqual([{ weekStart: '2026-09-28', value: 55 }, { weekStart: '2026-10-12', value: 70 }])
  })
})

describe('topHabits', () => {
  it('keeps the best going habits that are still running', () => {
    const habits = [
      { title: 'B', percent: 80 }, { title: 'A', percent: 80 }, { title: 'C', percent: 20 },
      { title: 'Old', percent: 99, archived: true }, { title: 'None', percent: null },
    ]
    expect(topHabits(habits, 2).map((h) => h.title)).toEqual(['A', 'B'])
  })
})

describe('isBrandNew', () => {
  it('is true only when nothing has ever been planned', () => {
    const quiet = { habits: { habits: [] }, weeks: [{ daysWithPlan: 0, upcomingTasks: 0, tasksDone: 0 }] }
    expect(isBrandNew(quiet)).toBe(true)
    expect(isBrandNew({ ...quiet, weeks: [{ daysWithPlan: 1, upcomingTasks: 0, tasksDone: 0 }] })).toBe(false)
    expect(isBrandNew(null)).toBe(false)
  })
})
