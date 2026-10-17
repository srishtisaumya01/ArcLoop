import { describe, expect, it } from 'vitest'
import { estimateWorkload } from '../../../src/utils/planner/index.js'
import { TODAY, ctx, frozen, makeOcc } from './fixtures.js'

// Default clock: Tuesday 2026-03-10 11:00 in New York -> 13 hours (780 minutes) left today.
const work = (occurrences, context = ctx(), planDate = TODAY) => estimateWorkload({ planDate, occurrences: frozen(occurrences) }, context)
const t = (minutes, extra = {}) => makeOcc({ estimatedMinutes: minutes, ...extra })

describe('estimateWorkload', () => {
  it('reports nothing remaining when there is nothing left to do', () => {
    const r = work([t(30, { completion: 1 }), t(30, { planState: 'excluded', excludedReason: 'removed' })])
    expect(r).toMatchObject({ remainingCount: 0, fitStatus: 'nothing_remaining', totalEstimatedMinutes: 0 })
    expect(work([]).fitStatus).toBe('nothing_remaining')
  })

  it('compares remaining estimates with the real time left today', () => {
    expect(work([t(60), t(120)])).toMatchObject({ remainingCount: 2, totalEstimatedMinutes: 180, availableMinutes: 780, fitStatus: 'fits' })
    expect(work([t(780)]).fitStatus).toBe('fits') // exactly the time left
    expect(work([t(781)]).fitStatus).toBe('exceeds')
  })

  it('a partially completed task counts at its FULL estimated duration', () => {
    const r = work([t(100, { completion: 0.5 }), t(60)])
    expect(r.totalEstimatedMinutes).toBe(160)
    expect(r.remainingCount).toBe(2)
  })

  it('tasks without a usable estimate withhold the comparison instead of guessing', () => {
    for (const bad of [null, undefined, 0, -5, 1.5, NaN, '30']) {
      const r = work([t(60), makeOcc({ estimatedMinutes: bad })])
      expect(r.fitStatus, String(bad)).toBe('unknown')
      expect(r.missingEstimateCount).toBe(1)
      expect(r.totalEstimatedMinutes).toBe(60) // known estimates are still summed
    }
  })

  it('all tasks without estimates is unknown, not "fits"', () => {
    const r = work([makeOcc(), makeOcc()])
    expect(r).toMatchObject({ fitStatus: 'unknown', missingEstimateCount: 2, totalEstimatedMinutes: 0 })
  })

  it('excluded, done and other-day tasks are not counted', () => {
    const r = work([t(60), t(500, { completion: 1 }), t(500, { planState: 'excluded', excludedReason: 'busy_day' }), t(500, { planDate: '2026-03-11' })])
    expect(r).toMatchObject({ remainingCount: 1, totalEstimatedMinutes: 60 })
  })

  it('counts remaining priority tasks', () => {
    expect(work([t(10, { isPriority: true }), t(10, { isPriority: true, completion: 1 }), t(10)]).priorityRemainingCount).toBe(1)
  })

  it('only gives a time comparison for today', () => {
    const r = work([t(30, { planDate: '2026-03-11' })], ctx(), '2026-03-11')
    expect(r).toMatchObject({ fitStatus: 'not_today', availableMinutes: null, remainingCount: 1 })
  })

  it('measures time left in real elapsed minutes on a spring-forward day', () => {
    const spring = ctx({ now: '2026-03-08T06:00:00Z' }) // 01:00 EST on 2026-03-08: 22 real hours remain
    expect(work([t(1320, { planDate: '2026-03-08' })], spring, '2026-03-08')).toMatchObject({ availableMinutes: 1320, fitStatus: 'fits' })
    expect(work([t(1321, { planDate: '2026-03-08' })], spring, '2026-03-08').fitStatus).toBe('exceeds')
  })

  it('measures time left on a fall-back day (25 hours)', () => {
    const fall = ctx({ now: '2026-11-01T04:00:00Z' }) // 00:00 EDT on 2026-11-01
    expect(work([t(10, { planDate: '2026-11-01' })], fall, '2026-11-01').availableMinutes).toBe(1500)
  })

  it('has no time left in the final minute of the day', () => {
    const late = ctx({ now: '2026-03-10T03:59:30Z' }) // 23:59:30 EDT on 2026-03-09
    const r = work([t(5, { planDate: '2026-03-09' })], late, '2026-03-09')
    expect(r.availableMinutes).toBe(0)
    expect(r.fitStatus).toBe('exceeds')
  })

  it('lists tasks whose planned start has passed, as candidates to reschedule or shorten', () => {
    const r = work([
      t(30, { id: 'past', plannedStart: '09:00' }),
      t(30, { id: 'later', plannedStart: '15:00' }),
      t(30, { id: 'untimed' }),
      t(30, { id: 'done', plannedStart: '08:00', completion: 1 }),
    ])
    expect(r.startTimePassedIds).toEqual(['past'])
  })

  it('does not list start-time suggestions for other days', () => {
    expect(work([t(30, { plannedStart: '09:00', planDate: '2026-03-11' })], ctx(), '2026-03-11').startTimePassedIds).toEqual([])
  })
})
