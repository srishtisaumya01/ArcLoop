import { describe, expect, it } from 'vitest'
import { summarizeWeek } from '../../../src/utils/planner/index.js'
import { describeDay } from '../../../src/components/planner/weekFormat.js'
import { ctx, frozen, makeDay, makeOcc, makeTemplate } from './fixtures.js'

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

  it('shows past days without a record as such; today without a record is simply not started yet', () => {
    const w = summarizeWeek({ days: [] }, ctx())
    expect(w.days[0]).toMatchObject({ kind: 'no_record', tasks: [] }) // Monday: never opened, never a zero
    expect(w.days[1]).toMatchObject({ date: TUE, kind: 'upcoming', plannedCount: 0 }) // today, not opened yet
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

  describe('upcoming days include the repeating tasks that would be added when the day is opened', () => {
    // Today is Tuesday 10 March. Wed 11 .. Sun 15 are upcoming.
    const tpl = (over) => makeTemplate({ archivedAt: null, ...over })
    const daily = tpl({ id: 'walk', title: 'Walk', estimatedMinutes: 30 })
    const weekly = tpl({ id: 'gym', title: 'Gym', recurrence: 'weekly', weekdays: [4, 6] }) // Thursday and Saturday
    const upcoming = (w) => w.days.filter((d) => d.kind === 'upcoming')

    it('counts a daily task on every unopened day from today on, with its estimate, and nothing before today', () => {
      const w = summarizeWeek({ days: frozen([rec(MON, [1])]), templates: frozen([daily]) }, ctx())
      expect(upcoming(w).map((d) => d.plannedCount)).toEqual([1, 1, 1, 1, 1, 1]) // today (unopened) and Wed..Sun
      expect(w.upcomingTasks).toBe(5) // coming up means after today
      expect(w.upcomingEstimatedMinutes).toBe(150)
      expect(w.tasksRemaining).toBe(2) // Monday's unfinished task + today's expected walk (work remaining today, as once the day is opened)
      expect(w.days[1]).toMatchObject({ date: TUE, kind: 'upcoming', expectedCount: 1 }) // today, not opened yet
      expect(w.days[0].count).toBe(1) // Monday is what was recorded
      const wednesday = w.days[2]
      expect(wednesday.tasks).toEqual([expect.objectContaining({ title: 'Walk', expected: true, templateId: 'walk', planState: 'active', completion: 0 })])
      expect(wednesday.expectedCount).toBe(1)
    })

    it('follows weekday schedules and start and end dates', () => {
      const startsThursday = tpl({ id: 'late', title: 'Late', startsOn: '2026-03-12' })
      const endsThursday = tpl({ id: 'early', title: 'Early', endsOn: '2026-03-12' })
      const w = summarizeWeek({ days: [], templates: frozen([weekly, startsThursday, endsThursday]) }, ctx())
      // Tue (today, unopened): Early. Wed: Early. Thu: Gym, Late, Early. Fri: Late. Sat: Gym, Late. Sun: Late.
      expect(upcoming(w).map((d) => d.tasks.map((t) => t.title).sort())).toEqual([['Early'], ['Early'], ['Early', 'Gym', 'Late'], ['Late'], ['Gym', 'Late'], ['Late']])
      expect(w.upcomingTasks).toBe(8) // Wed..Sun; today's Early counts as remaining
      expect(w.tasksRemaining).toBe(1)
    })

    it('leaves out ended and not-yet-started tasks; a task ended today still belongs to today (end dates are inclusive)', () => {
      const endedYesterday = tpl({ id: 'old', title: 'Old', archivedAt: '2026-03-09T15:00:00Z', endsOn: MON })
      const future = tpl({ id: 'next', title: 'Next month', startsOn: '2026-04-01' })
      expect(summarizeWeek({ days: [], templates: frozen([endedYesterday, future]) }, ctx()).upcomingTasks).toBe(0)
      // Archiving ends a task today, inclusive: an unopened today still expects it (as opening the day would add it); later days do not.
      const endedToday = tpl({ id: 'today', title: 'Ends today', archivedAt: '2026-03-10T15:00:00Z', endsOn: TUE })
      const w = summarizeWeek({ days: [], templates: frozen([endedToday]) }, ctx())
      expect(upcoming(w).map((d) => d.plannedCount)).toEqual([1, 0, 0, 0, 0, 0])
    })

    it('never counts a task twice when the day already has its occurrence, in any state', () => {
      const wed = {
        day: makeDay({ planDate: WED }),
        occurrences: [makeOcc({ planDate: WED, templateId: 'walk', title: 'Walk', estimatedMinutes: 30 })],
      }
      const thu = {
        day: makeDay({ planDate: '2026-03-12' }),
        occurrences: [makeOcc({ planDate: '2026-03-12', templateId: 'walk', title: 'Walk', planState: 'excluded', excludedReason: 'rescheduled' })],
      }
      const w = summarizeWeek({ days: frozen([wed, thu]), templates: frozen([daily]) }, ctx())
      expect(w.days[2]).toMatchObject({ plannedCount: 1, expectedCount: 0, estimatedMinutes: 30 }) // the real occurrence, once
      expect(w.days[3]).toMatchObject({ plannedCount: 0, expectedCount: 0, setAsideCount: 1 }) // moved away: present, so not re-added, and not active
      expect(upcoming(w).map((d) => d.plannedCount)).toEqual([1, 1, 0, 1, 1, 1]) // today (unopened), Wed real, Thu moved away, Fri..Sun
    })

    it('respects a day\'s suppression list (a task removed from that day is not expected back)', () => {
      const wed = { day: makeDay({ planDate: WED, suppressedTemplateIds: ['walk'] }), occurrences: [] }
      const w = summarizeWeek({ days: frozen([wed]), templates: frozen([daily]) }, ctx())
      expect(w.days[2].plannedCount).toBe(0)
      expect(w.days[3].plannedCount).toBe(1)
    })

    it('adds expected tasks to a planned future rest day as well (rest only labels the day, as when it is opened)', () => {
      const wed = { day: makeDay({ planDate: WED, dayMode: 'rest' }), occurrences: [] }
      const w = summarizeWeek({ days: frozen([wed]), templates: frozen([daily]) }, ctx())
      expect(w.days[2]).toMatchObject({ isRestDay: true, plannedCount: 1 })
    })

    it('projects today while it has no record, and once it has one the record is authoritative', () => {
      const unopened = summarizeWeek({ days: [], templates: frozen([daily, weekly]) }, ctx())
      expect(unopened.days[1]).toMatchObject({ date: TUE, kind: 'upcoming', plannedCount: 1, expectedCount: 1 }) // Walk; Gym is not on Tuesdays
      expect(unopened.days[1].tasks[0]).toMatchObject({ title: 'Walk', expected: true })
      expect(unopened.upcomingTasks).toBe(5 + 2) // after today: five daily walks, two gym days
      expect(unopened.tasksRemaining).toBe(1) // today's walk, not yet started
      expect(unopened.daysWithPlan).toBe(0) // nothing is recorded yet
      // Today with a record that holds only a one-off task: the record stands; the daily Walk is not projected onto it.
      const opened = summarizeWeek({ days: frozen([rec(TUE, [0])]), templates: frozen([daily]) }, ctx())
      expect(opened.days[1]).toMatchObject({ date: TUE, kind: 'planned', count: 1 })
      expect(opened.days[1].expectedCount).toBeUndefined()
      expect(opened.upcomingTasks).toBe(5)
    })

    it('projects from the CURRENT template while saved occurrences keep their own values', () => {
      const edited = tpl({ id: 'walk', title: 'Long walk', estimatedMinutes: 45 }) // the template after an edit
      const wed = { day: makeDay({ planDate: WED }), occurrences: [makeOcc({ planDate: WED, templateId: 'walk', title: 'Walk', estimatedMinutes: 20 })] }
      const w = summarizeWeek({ days: frozen([rec(MON, [1]), wed]), templates: frozen([edited]) }, ctx())
      expect(w.days[2].tasks).toEqual([expect.objectContaining({ title: 'Walk', estimatedMinutes: 20 })]) // saved row, untouched here
      expect(w.days[3].tasks).toEqual([expect.objectContaining({ title: 'Long walk', estimatedMinutes: 45, expected: true })]) // not materialised: current template
      expect(w.days[2].expectedCount).toBe(0)
      expect(w.upcomingEstimatedMinutes).toBe(20 + 45 * 4) // Wed saved + Thu..Sun projected; today's is remaining, not coming up
      expect(w.tasksRemaining).toBe(2) // Monday's unfinished task + today's expected walk
    })

    it('labels an unopened today like an opened day with no progress', () => {
      const todayEntry = { kind: 'upcoming', plannedCount: 2, isRestDay: false, setAsideCount: 0 }
      expect(describeDay(todayEntry, { isToday: true })).toMatchObject({ label: 'Not started yet', detail: '2 tasks planned' })
      expect(describeDay(todayEntry)).toMatchObject({ label: 'Planned', detail: '2 tasks planned' }) // a later day
      expect(describeDay({ ...todayEntry, plannedCount: 0 }, { isToday: true }).label).toBe('Nothing planned yet')
    })

    it('is unchanged without templates, and for weeks entirely in the past', () => {
      expect(summarizeWeek({ days: [] }, ctx()).upcomingTasks).toBe(0)
      const past = summarizeWeek({ weekOf: '2026-03-02', days: [], templates: frozen([daily]) }, ctx())
      expect(past.upcomingTasks).toBe(0)
      expect(past.days.every((d) => d.kind === 'no_record')).toBe(true)
    })
  })

  it('does not mutate its input', () => {
    expect(() => summarizeWeek({ days: frozen([rec(MON, [{ completion: 1 }])]) }, ctx())).not.toThrow()
  })
})
