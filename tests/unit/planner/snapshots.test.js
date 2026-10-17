import { describe, expect, it } from 'vitest'
import {
  buildPlanSnapshot,
  deepFreeze,
  occurrencesToCreate,
  planTemplateEdit,
  rescheduleOccurrence,
  setAside,
  setCompletion,
  sortOccurrencesForDisplay,
} from '../../../src/utils/planner/index.js'
import { TODAY, ctx, makeDay, makeOcc, makeTemplate } from './fixtures.js'

const BASELINE = '2026-03-10T09:00:00.000Z'

function revisedDay() {
  const day = makeDay({ dayMode: 'busy', baselineAt: BASELINE })
  const occurrences = [
    makeOcc({ id: 'a', title: 'Gym', plannedStart: '07:00', completion: 1, completedAt: BASELINE }),
    makeOcc({ id: 'b', title: 'Read', plannedStart: '20:00' }),
    makeOcc({ id: 'c', title: 'Laundry', planState: 'excluded', excludedReason: 'busy_day', excludedAt: BASELINE }),
    makeOcc({ id: 'd', title: 'Call', inOriginalPlan: false, completion: 0.5, completedAt: BASELINE }),
  ]
  return { day, occurrences }
}

describe('buildPlanSnapshot: original vs revised', () => {
  const snapshot = buildPlanSnapshot(revisedDay())

  it('keeps the original plan separate from the current plan', () => {
    expect(snapshot.original.map((o) => o.id).sort()).toEqual(['a', 'b', 'c']) // includes the set-aside task
    expect(snapshot.current.map((o) => o.id).sort()).toEqual(['a', 'b', 'd'])
    expect(snapshot.setAside.map((o) => o.id)).toEqual(['c'])
    expect(snapshot.addedAfterBaseline.map((o) => o.id)).toEqual(['d'])
  })

  it('a task added after the baseline appears only in the current plan', () => {
    expect(snapshot.original.some((o) => o.id === 'd')).toBe(false)
    expect(snapshot.current.some((o) => o.id === 'd')).toBe(true)
  })

  it('reports both progress figures and the day identity', () => {
    expect(snapshot.progress.current).toMatchObject({ count: 3, units: 1.5, percent: 50 })
    expect(snapshot.progress.original).toMatchObject({ count: 3, units: 1, percent: 33 })
    expect(snapshot).toMatchObject({ planDate: TODAY, dayMode: 'busy', kind: 'planned', revised: true, baselineAt: BASELINE, isRestDay: false })
  })

  it('orders tasks chronologically, timed first', () => {
    expect(snapshot.current.map((o) => o.id)).toEqual(['a', 'b', 'd']) // 07:00, 20:00, untimed
  })

  it('marks an untouched day as not revised and has no original figure', () => {
    const s = buildPlanSnapshot({ day: makeDay(), occurrences: [makeOcc(), makeOcc()] })
    expect(s.revised).toBe(false)
    expect(s.progress.original).toBeNull()
  })

  it('an empty snapshot has no percentage', () => {
    const s = buildPlanSnapshot({ day: makeDay(), occurrences: [] })
    expect(s.kind).toBe('empty')
    expect(s.progress.current.percent).toBeNull()
  })

  it('identifies a rest day that still contains tasks', () => {
    const s = buildPlanSnapshot({ day: makeDay({ dayMode: 'rest', baselineAt: BASELINE }), occurrences: [makeOcc()] })
    expect(s).toMatchObject({ isRestDay: true, kind: 'rest' })
    expect(s.current).toHaveLength(1)
  })
})

describe('snapshots are immutable', () => {
  it('is deeply frozen: edits throw', () => {
    const s = buildPlanSnapshot(revisedDay())
    expect(Object.isFrozen(s)).toBe(true)
    expect(Object.isFrozen(s.original)).toBe(true)
    expect(Object.isFrozen(s.original[0])).toBe(true)
    expect(Object.isFrozen(s.progress.current)).toBe(true)
    expect(() => { s.dayMode = 'normal' }).toThrow(TypeError)
    expect(() => s.original.push({})).toThrow(TypeError)
    expect(() => { s.original[0].completion = 0 }).toThrow(TypeError)
  })

  it('is a copy: later changes to the live data never alter it', () => {
    const live = revisedDay()
    const s = buildPlanSnapshot(live)
    live.occurrences[0].completion = 0
    live.occurrences[0].title = 'CHANGED'
    live.day.dayMode = 'normal'
    live.occurrences.push(makeOcc({ id: 'late' }))
    expect(s.original.find((o) => o.id === 'a')).toMatchObject({ completion: 1, title: 'Gym' })
    expect(s.dayMode).toBe('busy')
    expect(s.current.some((o) => o.id === 'late')).toBe(false)
  })

  it('is deterministic: identical input gives identical output, whatever the input order', () => {
    const a = revisedDay()
    const reversed = { day: a.day, occurrences: [...a.occurrences].reverse() }
    expect(buildPlanSnapshot(a)).toEqual(buildPlanSnapshot(reversed))
    expect(buildPlanSnapshot(a)).toEqual(buildPlanSnapshot(a))
  })

  it('deepFreeze handles nesting and is safe to call twice', () => {
    const o = deepFreeze({ a: { b: [1, { c: 2 }] } })
    expect(Object.isFrozen(o.a.b[1])).toBe(true)
    expect(() => deepFreeze(o)).not.toThrow()
  })
})

describe('historical plan snapshots are not rewritten by later changes', () => {
  it('editing the template does not change a past occurrence\'s title or time', () => {
    const template = makeTemplate({ id: 'tpl', title: 'Walk', plannedStart: '07:00' })
    const pastDay = makeDay({ planDate: '2026-03-08' })
    const past = occurrencesToCreate({ templates: [template], occurrences: [], day: pastDay, planDate: '2026-03-08' }, ctx())[0]
    const stored = { ...makeOcc({ id: 'past', ...past, planDate: '2026-03-08' }) }
    const before = buildPlanSnapshot({ day: pastDay, occurrences: [stored] })

    const edit = planTemplateEdit({ template, changes: { title: 'Run', plannedStart: '06:00' }, occurrences: [stored] }, ctx())
    expect(edit.updates).toEqual([]) // past occurrences are never updated

    const after = buildPlanSnapshot({ day: pastDay, occurrences: [stored] })
    expect(after).toEqual(before)
    expect(after.current[0]).toMatchObject({ title: 'Walk', plannedStart: '07:00' })
  })

  it('a full day of changes leaves each step\'s snapshot intact', () => {
    let day = makeDay()
    let occurrences = [makeOcc({ id: 'a' }), makeOcc({ id: 'b' }), makeOcc({ id: 'c' })]
    const snaps = [buildPlanSnapshot({ day, occurrences })]

    let r = setCompletion({ occurrence: occurrences[0], day, value: 1 }, ctx())
    occurrences = [r.occurrence, occurrences[1], occurrences[2]]
    day = r.day
    snaps.push(buildPlanSnapshot({ day, occurrences }))

    const aside = setAside({ occurrence: occurrences[1], day, reason: 'busy_day' }, ctx())
    occurrences = [occurrences[0], aside.occurrence, occurrences[2]]
    day = aside.day
    snaps.push(buildPlanSnapshot({ day, occurrences }))

    const moved = rescheduleOccurrence({ occurrence: occurrences[2], day, targetDate: '2026-03-12' }, ctx())
    occurrences = [occurrences[0], occurrences[1], moved.source]
    day = moved.sourceDay
    snaps.push(buildPlanSnapshot({ day, occurrences }))

    expect(snaps.map((s) => s.progress.current.percent)).toEqual([0, 33, 50, 100])
    expect(snaps.map((s) => s.revised)).toEqual([false, false, true, true])
    // The earliest snapshot still shows the whole original plan, untouched.
    expect(snaps[0].current).toHaveLength(3)
    expect(snaps[3].original).toHaveLength(3)
    expect(snaps[3].original.map((o) => o.completion)).toEqual([1, 0, 0])
  })
})

describe('sortOccurrencesForDisplay', () => {
  const o = (id, extra = {}) => makeOcc({ id, createdAt: `2026-03-10T08:0${id.charCodeAt(0) % 10}:00.000Z`, ...extra })

  it('puts timed tasks first by start time, then untimed tasks in creation order', () => {
    const list = [o('u2'), o('t2', { plannedStart: '13:00' }), o('u1'), o('t1', { plannedStart: '07:30' })]
    const sorted = sortOccurrencesForDisplay(list).map((x) => x.id)
    expect(sorted.slice(0, 2)).toEqual(['t1', 't2'])
    expect(sorted.slice(2).sort()).toEqual(['u1', 'u2'])
  })

  it('breaks start-time ties by end time, with open-ended tasks last', () => {
    const list = [
      o('open', { plannedStart: '09:00' }),
      o('long', { plannedStart: '09:00', plannedEnd: '11:00' }),
      o('short', { plannedStart: '09:00', plannedEnd: '09:30' }),
    ]
    expect(sortOccurrencesForDisplay(list).map((x) => x.id)).toEqual(['short', 'long', 'open'])
  })

  it('is deterministic for identical keys and does not mutate its input', () => {
    const list = Object.freeze([makeOcc({ id: 'b', title: 'Same', createdAt: 'x' }), makeOcc({ id: 'a', title: 'Same', createdAt: 'x' })])
    expect(sortOccurrencesForDisplay(list).map((x) => x.id)).toEqual(['a', 'b'])
    expect(list.map((x) => x.id)).toEqual(['b', 'a'])
  })

  it('treats midnight as a valid timed start', () => {
    const list = [o('late', { plannedStart: '23:30' }), o('mid', { plannedStart: '00:00' })]
    expect(sortOccurrencesForDisplay(list).map((x) => x.id)).toEqual(['mid', 'late'])
  })
})
