import { describe, expect, it } from 'vitest'
import {
  ERR,
  PlannerError,
  buildPlanSnapshot,
  createDay,
  occurrencesToCreate,
  planRemoval,
  proposeSetAside,
  rescheduleOccurrence,
  restoreOccurrence,
  setAside,
  setCompletion,
  setDayMode,
  summarizeDay,
  summarizeWeek,
} from '../../../src/utils/planner/index.js'
import { TODAY, ctx, makeOcc, makeTemplate } from './fixtures.js'

const code = (fn) => {
  try {
    fn()
  } catch (e) {
    return e instanceof PlannerError ? e.code : `non-planner:${e.name}`
  }
  return null
}

// Persist drafts the way a service would: assign ids.
let seq = 0
const persist = (drafts) => drafts.map((d) => makeOcc({ ...d, id: `s${(seq += 1)}` }))

const templates = [
  makeTemplate({ id: 'wake', title: 'Wake up', plannedStart: '06:30' }),
  makeTemplate({ id: 'study', title: 'Study', plannedStart: '09:00', plannedEnd: '11:00', isPriority: true, estimatedMinutes: 120 }),
  makeTemplate({ id: 'gym', title: 'Gym', plannedStart: '17:00', estimatedMinutes: 60 }),
  makeTemplate({ id: 'read', title: 'Read', estimatedMinutes: 30 }),
  makeTemplate({ id: 'bed', title: 'Bedtime', plannedStart: '23:00' }),
  makeTemplate({ id: 'call', title: 'Call family', recurrence: 'weekly', weekdays: [2] }), // Tuesdays
]

describe('a festival / busy day, start to finish', () => {
  it('keeps the original plan, never discards tasks, and shows honest original and revised figures', () => {
    // Morning: open the day. Six tasks appear (it is a Tuesday).
    let day = createDay(TODAY)
    let occurrences = persist(occurrencesToCreate({ templates, occurrences: [], day, planDate: TODAY }, ctx()))
    expect(occurrences).toHaveLength(6)
    expect(summarizeDay({ day, occurrences })).toMatchObject({ kind: 'planned', revised: false, original: null })
    expect(summarizeDay({ day, occurrences }).current).toMatchObject({ count: 6, percent: 0 })

    // Opening the day again creates nothing new.
    expect(occurrencesToCreate({ templates, occurrences, day, planDate: TODAY }, ctx())).toEqual([])

    // Tick "Wake up" and half of "Study" -> the baseline is fixed.
    const byTitle = (t) => occurrences.find((o) => o.title === t)
    const replace = (next) => { occurrences = occurrences.map((o) => (o.id === next.id ? next : o)) }
    let r = setCompletion({ occurrence: byTitle('Wake up'), day, value: 1 }, ctx())
    replace(r.occurrence); day = r.day
    r = setCompletion({ occurrence: byTitle('Study'), day, value: 0.5 }, ctx())
    replace(r.occurrence); day = r.day
    expect(day.baselineAt).not.toBeNull()
    expect(summarizeDay({ day, occurrences }).current).toMatchObject({ count: 6, units: 1.5, percent: 25 })

    // A festival: switch to Busy and keep only priorities.
    day = setDayMode({ day, mode: 'busy' }, ctx())
    const proposal = proposeSetAside({ mode: 'busy', occurrences })
    // Open, non-priority tasks: Gym, Read, Bedtime, Call family. "Wake up" is done; "Study" is a priority.
    expect(proposal.ids).toHaveLength(4)
    for (const id of proposal.ids) {
      const x = setAside({ occurrence: occurrences.find((o) => o.id === id), day, reason: proposal.reason }, ctx())
      replace(x.occurrence); day = x.day
    }
    expect(occurrences).toHaveLength(6) // nothing discarded

    // Move "Gym" from set-aside back? It is set aside, so restore it, then move it to Friday instead.
    const gym = byTitle('Gym')
    expect(gym.planState).toBe('excluded')
    replace(restoreOccurrence({ occurrence: gym }, ctx()))
    const moved = rescheduleOccurrence({ occurrence: byTitle('Gym'), day, targetDate: '2026-03-13' }, ctx())
    replace(moved.source); day = moved.sourceDay

    // Late in the day the user adds something new.
    const added = persist([{ ...makeOcc({ title: 'Buy flowers', completion: 1, completedAt: '2026-03-10T20:00:00.000Z' }), inOriginalPlan: day.baselineAt === null }])
    occurrences = [...occurrences, ...added]

    const s = summarizeDay({ day, occurrences })
    // Current plan: Wake up (done), Study (half, priority kept), Buy flowers (done, added later).
    expect(s.current).toMatchObject({ count: 3, units: 2.5, percent: 83 })
    // Original plan: the six morning tasks only. Units earned there: 1 + 0.5 (Buy flowers is not in it).
    expect(s.original).toMatchObject({ count: 6, units: 1.5, percent: 25 })
    expect(s.revised).toBe(true)
    expect(s.setAsideCount).toBe(4) // Read, Bedtime, Call family, and Gym (moved to Friday)

    const snap = buildPlanSnapshot({ day, occurrences })
    expect(snap.addedAfterBaseline.map((o) => o.title)).toEqual(['Buy flowers'])
    expect(snap.original.map((o) => o.title)).not.toContain('Buy flowers')
    expect(snap.setAside).toHaveLength(4)
    expect(snap.setAside.find((o) => o.title === 'Gym')).toMatchObject({ excludedReason: 'rescheduled', planDate: TODAY })
    expect(snap.original).toHaveLength(6)
  })
})

describe('rest day', () => {
  it('can be chosen deliberately, keeps tasks visible and is not scored as a miss', () => {
    let day = createDay(TODAY)
    let occurrences = persist(occurrencesToCreate({ templates, occurrences: [], day, planDate: TODAY }, ctx()))
    day = setDayMode({ day, mode: 'rest' }, ctx())
    for (const id of proposeSetAside({ mode: 'rest', occurrences }).ids) {
      const x = setAside({ occurrence: occurrences.find((o) => o.id === id), day, reason: 'rest_day' }, ctx())
      occurrences = occurrences.map((o) => (o.id === id ? x.occurrence : o))
      day = x.day
    }
    const s = summarizeDay({ day, occurrences })
    expect(s.kind).toBe('rest')
    expect(s.current.percent).toBeNull() // nothing active: no 0%, no NaN
    expect(s.original.count).toBe(6) // the original plan is still on record

    const week = summarizeWeek({ days: [{ day, occurrences }] }, ctx())
    expect(week.restDays).toBe(1)
    expect(week.averagePercent).toBeNull()
  })
})

describe('deleting a recurring task (C1) end to end', () => {
  it('before any progress: deleted for the day, and stays deleted when the day is reopened', () => {
    let day = createDay(TODAY)
    let occurrences = persist(occurrencesToCreate({ templates, occurrences: [], day, planDate: TODAY }, ctx()))
    const target = occurrences.find((o) => o.title === 'Read')
    const removal = planRemoval({ occurrence: target, day }, ctx())
    expect(removal.action).toBe('delete')
    occurrences = occurrences.filter((o) => o.id !== removal.occurrenceId)
    day = removal.day
    expect(day.baselineAt).toBeNull() // composing the plan is not a revision
    expect(occurrencesToCreate({ templates, occurrences, day, planDate: TODAY }, ctx())).toEqual([])
    expect(summarizeDay({ day, occurrences }).current.count).toBe(5)
  })
})

describe('returning after missed days', () => {
  it('older days cannot be backfilled, are not scored, and earlier progress is untouched', () => {
    // Today is 2026-03-10. The user last opened the app on 2026-02-20.
    const old = createDay('2026-02-20')
    expect(code(() => occurrencesToCreate({ templates, occurrences: [], day: old, planDate: '2026-02-20' }, ctx()))).toBe(ERR.DATE_NOT_EDITABLE)

    const earlier = { day: { ...old, baselineAt: '2026-02-20T09:00:00.000Z' }, occurrences: [makeOcc({ planDate: '2026-02-20', completion: 1 })] }
    expect(summarizeDay(earlier).current).toMatchObject({ units: 1, percent: 100 }) // history intact

    // The week of the gap simply has no records: no zeros, no penalties.
    const gapWeek = summarizeWeek({ weekOf: '2026-03-02', days: [] }, ctx())
    expect(gapWeek.days.every((d) => d.kind === 'no_record')).toBe(true)
    expect(gapWeek.averagePercent).toBeNull()
    expect(gapWeek.eligible).toBe(false)

    // Starting fresh today works normally.
    const day = createDay(TODAY)
    const fresh = occurrencesToCreate({ templates, occurrences: [], day, planDate: TODAY }, ctx())
    expect(fresh).toHaveLength(6)
  })
})
