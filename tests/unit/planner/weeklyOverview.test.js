import { describe, expect, it } from 'vitest'
import { summarizeWeek } from '../../../src/utils/planner/index.js'
import { ctx, frozen, makeDay, makeOcc } from './fixtures.js'

// Today is Tuesday 2026-03-10 (fixed clock). Week: Mon 03-09 .. Sun 03-15.
const MON = '2026-03-09'
const TUE = '2026-03-10'
const WED = '2026-03-11'

const rec = (planDate, occs, dayMode = 'normal') => ({ day: makeDay({ planDate, dayMode }), occurrences: occs.map((o) => makeOcc({ planDate, ...o })) })

describe('weekly overview data (tasks, remaining, upcoming workload)', () => {
  const week = summarizeWeek(
    {
      days: frozen([
        rec(MON, [{ title: 'A', completion: 1 }, { title: 'B', completion: 0 }, { title: 'Moved', planState: 'excluded', excludedReason: 'rescheduled' }]),
        rec(TUE, [{ title: 'C', completion: 0.5 }]),
        rec(WED, [{ title: 'D', estimatedMinutes: 30 }, { title: 'E' }, { title: 'Aside', planState: 'excluded', excludedReason: 'busy_day', estimatedMinutes: 60 }]),
      ]),
    },
    ctx(),
  )

  it('flags the current week and reports today', () => {
    expect(week.isCurrentWeek).toBe(true)
    expect(week.today).toBe(TUE)
    expect(summarizeWeek({ weekOf: '2026-03-02', days: [] }, ctx()).isCurrentWeek).toBe(false)
    expect(summarizeWeek({ weekOf: '2026-03-16', days: [] }, ctx()).isCurrentWeek).toBe(false)
  })

  it('lists active tasks and set-aside tasks apart, and counts only active tasks as remaining', () => {
    const monday = week.days[0]
    expect(monday.tasks.map((t) => t.title).sort()).toEqual(['A', 'B'])
    expect(monday.setAside.map((t) => t.title)).toEqual(['Moved'])
    expect(monday.setAside[0].excludedReason).toBe('rescheduled')
    expect(monday.remaining).toBe(1)
    expect(week.tasksRemaining).toBe(2) // B on Monday, the partly done C today
  })

  it('treats days after today as upcoming workload, never as progress', () => {
    const wednesday = week.days[2]
    expect(wednesday.kind).toBe('upcoming')
    expect(wednesday.plannedCount).toBe(2)
    expect(wednesday.estimatedMinutes).toBe(30)
    expect(wednesday.missingEstimates).toBe(1)
    expect(week.upcomingTasks).toBe(2)
    expect(week.upcomingEstimatedMinutes).toBe(30)
    expect(week.upcomingMissingEstimates).toBe(1)
    expect(week.tasksDone).toBe(1)
    expect(week.daysWithProgress).toBe(2) // Monday and today only
  })

  it('shows days without a record and later days without a record as such', () => {
    const w = summarizeWeek({ days: [] }, ctx())
    expect(w.days.slice(0, 2).every((d) => d.kind === 'no_record' && d.tasks.length === 0)).toBe(true)
    expect(w.days.slice(2).every((d) => d.kind === 'upcoming' && d.plannedCount === 0)).toBe(true)
    expect(w.tasksRemaining).toBe(0)
    expect(w.upcomingTasks).toBe(0)
  })

  it('keeps rest days out of the average and distinguishes them from empty days', () => {
    const w = summarizeWeek(
      { days: frozen([rec(MON, [{ completion: 1 }]), rec(TUE, [], 'rest')]) },
      ctx(),
    )
    expect(w.days[1].kind).toBe('rest')
    expect(w.days[1].isRestDay).toBe(true)
    expect(w.restDays).toBe(1)
    expect(w.averagePercent).toBe(100)
    const empty = summarizeWeek({ days: frozen([rec(TUE, [])]) }, ctx())
    expect(empty.days[1].kind).toBe('empty')
  })

  it('does not mutate its input', () => {
    expect(() => summarizeWeek({ days: frozen([rec(MON, [{ completion: 1 }])]) }, ctx())).not.toThrow()
  })
})
