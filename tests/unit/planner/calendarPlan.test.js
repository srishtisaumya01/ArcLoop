import { describe, expect, it } from 'vitest'
import { ERR, PlannerError, addDays, planForRange } from '../../../src/utils/planner/index.js'
import { TODAY, ctx, makeDay, makeOcc, makeTemplate } from './fixtures.js'

describe('planForRange: the plan for a range of dates', () => {
  const plan = (args) => planForRange(args, ctx())

  it('has one entry per date, oldest first, starting no earlier than today', () => {
    expect(plan({ from: '2026-03-08', to: '2026-03-12' }).map((d) => d.date)).toEqual(['2026-03-10', '2026-03-11', '2026-03-12'])
    expect(plan({ from: TODAY, to: TODAY })).toHaveLength(1)
  })

  it('is empty for a range that ends before today (history is a record, not a plan)', () => {
    expect(plan({ from: '2026-03-01', to: '2026-03-09' })).toEqual([])
  })

  it('stops at the plan-ahead limit instead of projecting forever', () => {
    const days = plan({ from: TODAY, to: '2027-03-10' })
    expect(days.at(-1).date).toBe(addDays(TODAY, 30))
    expect(days).toHaveLength(31)
  })

  it('rejects an invalid or reversed range with a coded error', () => {
    for (const range of [{ from: 'soon', to: TODAY }, { from: TODAY, to: '2026-13-40' }, { from: '2026-03-12', to: '2026-03-10' }, { from: undefined, to: TODAY }]) {
      expect(() => plan(range), JSON.stringify(range)).toThrow(PlannerError)
      try {
        plan(range)
      } catch (error) {
        expect(error.code).toBe(ERR.INVALID_ARGUMENT)
      }
    }
  })

  it('today with no record holds the repeating tasks it will get; with a record it is that record alone', () => {
    const templates = [makeTemplate({ id: 'walk', title: 'Walk' })]
    expect(plan({ from: TODAY, to: TODAY, templates })[0].tasks.map((t) => [t.title, Boolean(t.expected)])).toEqual([['Walk', true]])
    const record = { day: makeDay(), occurrences: [makeOcc({ title: 'Only this', completion: 1 })] }
    expect(plan({ from: TODAY, to: TODAY, templates, days: [record] })[0].tasks.map((t) => [t.title, Boolean(t.expected)])).toEqual([['Only this', false]])
  })

  it('a later day never counts a repeating task twice, and carries its day type', () => {
    const templates = [makeTemplate({ id: 'walk', title: 'Walk' })]
    const record = { day: makeDay({ planDate: '2026-03-11', dayMode: 'rest' }), occurrences: [makeOcc({ templateId: 'walk', planDate: '2026-03-11', title: 'Walk' })] }
    const [, wednesday] = plan({ from: TODAY, to: '2026-03-11', templates, days: [record] })
    expect(wednesday).toMatchObject({ date: '2026-03-11', dayMode: 'rest' })
    expect(wednesday.tasks).toHaveLength(1)
  })

  it('puts saved tasks in display order (by time, untimed last) and the not-yet-added repeating ones after them', () => {
    const record = { day: makeDay({ planDate: '2026-03-11' }), occurrences: [makeOcc({ planDate: '2026-03-11', title: 'Untimed' }), makeOcc({ planDate: '2026-03-11', title: 'Early', plannedStart: '07:00' })] }
    const [, wednesday] = plan({ from: TODAY, to: '2026-03-11', templates: [makeTemplate({ id: 'late', title: 'Projected' })], days: [record] })
    expect(wednesday.tasks.map((t) => t.title)).toEqual(['Early', 'Untimed', 'Projected'])
  })

  it('does not change what it is given', () => {
    const templates = Object.freeze([Object.freeze(makeTemplate({ id: 'walk' }))])
    const days = Object.freeze([Object.freeze({ day: Object.freeze(makeDay()), occurrences: Object.freeze([Object.freeze(makeOcc())]) })])
    expect(() => plan({ from: TODAY, to: '2026-03-12', templates, days })).not.toThrow()
  })
})
