import { describe, expect, it } from 'vitest'
import { ERR, PlannerError, summarizeHabits } from '../../../src/utils/planner/index.js'
import { frozen, makeOcc, makeTemplate } from './fixtures.js'

const FROM = '2026-03-04'
const TO = '2026-03-10'
const walk = makeTemplate({ id: 'walk', title: 'Walk' })
const read = makeTemplate({ id: 'read', title: 'Read' })
const occ = (templateId, planDate, extra = {}) => makeOcc({ templateId, planDate, ...extra })
const run = (over) => summarizeHabits({ templates: [walk, read], days: [], occurrences: [], from: FROM, to: TO, ...over })
const code = (fn) => {
  try {
    fn()
  } catch (e) {
    return e instanceof PlannerError ? e.code : `other:${e.name}`
  }
  return null
}

describe('summarizeHabits', () => {
  it('counts done and partly done with the same percentage rules as a day', () => {
    const [w] = run({ occurrences: [occ('walk', '2026-03-04', { completion: 1 }), occ('walk', '2026-03-05', { completion: 1 }), occ('walk', '2026-03-06', { completion: 0.5 }), occ('walk', '2026-03-07'), occ('walk', '2026-03-10')] })
    expect(w).toMatchObject({ templateId: 'walk', title: 'Walk', planned: 5, done: 2, partial: 1, pending: 2, units: 2.5, percent: 50 })
  })

  it('never reports 100 for a near miss, and reports 100 only when every planned day is done', () => {
    const nine = Array.from({ length: 9 }, (_, i) => occ('walk', `2026-03-0${i + 1}`, { completion: 1 }))
    expect(run({ from: '2026-03-01', occurrences: [...nine, occ('walk', '2026-03-10')] })[0].percent).toBe(90)
    expect(run({ occurrences: [occ('walk', '2026-03-04', { completion: 1 })] })[0].percent).toBe(100)
  })

  it('does not count tasks that were moved, set aside or removed', () => {
    const [w] = run({
      occurrences: [
        occ('walk', '2026-03-04', { completion: 1 }),
        occ('walk', '2026-03-05', { planState: 'excluded', excludedReason: 'rescheduled' }),
        occ('walk', '2026-03-06', { planState: 'excluded', excludedReason: 'busy_day' }),
        occ('walk', '2026-03-07', { planState: 'excluded', excludedReason: 'removed' }),
      ],
    })
    expect(w).toMatchObject({ planned: 1, done: 1, percent: 100 })
  })

  it('leaves rest days out entirely', () => {
    const [w] = run({
      days: [{ planDate: '2026-03-05', dayMode: 'rest' }, { planDate: '2026-03-06', dayMode: 'busy' }],
      occurrences: [occ('walk', '2026-03-04', { completion: 1 }), occ('walk', '2026-03-05'), occ('walk', '2026-03-06', { completion: 1 })],
    })
    expect(w).toMatchObject({ planned: 2, done: 2, percent: 100 }) // the rest day is not a miss; a busy day still counts
  })

  it('only looks inside the window, and ignores one-off tasks and other templates\' tasks', () => {
    const habits = run({
      templates: [walk, makeTemplate({ id: 'once', title: 'Once', recurrence: 'once', startsOn: TO, endsOn: TO })],
      occurrences: [
        occ('walk', '2026-03-03', { completion: 1 }), // before the window
        occ('walk', '2026-03-11', { completion: 1 }), // after today
        occ('walk', '2026-03-04', { completion: 1 }),
        occ('once', TO, { completion: 1 }),
        occ(null, TO, { completion: 1 }), // a one-off with no template
        occ('other-template', TO, { completion: 1 }),
      ],
    })
    expect(habits).toHaveLength(1)
    expect(habits[0]).toMatchObject({ title: 'Walk', planned: 1 })
  })

  it('leaves out habits with nothing planned in the window, keeps ended ones that had days, and sorts by title', () => {
    const ended = makeTemplate({ id: 'old', title: 'Aerobics', archivedAt: '2026-03-08T00:00:00Z', endsOn: '2026-03-08' })
    const habits = run({
      templates: [walk, read, ended],
      occurrences: [occ('walk', '2026-03-04'), occ('old', '2026-03-05', { completion: 1 })],
    })
    expect(habits.map((h) => [h.title, h.archived])).toEqual([['Aerobics', true], ['Walk', false]])
  })

  it('has no streak, rank or missed-day fields, and does not change its input', () => {
    const input = { templates: frozen([walk]), days: frozen([]), occurrences: frozen([occ('walk', '2026-03-04', { completion: 1 })]), from: FROM, to: TO }
    const [w] = summarizeHabits(input)
    expect(Object.keys(w).sort()).toEqual(['archived', 'done', 'partial', 'pending', 'percent', 'planned', 'templateId', 'title', 'units'])
  })

  it('rejects an upside-down window and bad dates', () => {
    expect(code(() => run({ from: TO, to: FROM }))).toBe(ERR.INVALID_ARGUMENT)
    expect(code(() => run({ from: 'nope' }))).toBe(ERR.INVALID_DATE)
  })
})
