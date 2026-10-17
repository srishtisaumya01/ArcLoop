import { describe, expect, it } from 'vitest'
import {
  DAY_MODES,
  ERR,
  PlannerError,
  createDay,
  isRestDay,
  isValidDayMode,
  proposeSetAside,
  setAside,
  setDayMode,
  stampBaseline,
  summarizeDay,
  suppressTemplate,
  unsuppressTemplate,
} from '../../../src/utils/planner/index.js'
import { NOW, TODAY, ctx, frozen, makeDay, makeOcc } from './fixtures.js'

const code = (fn) => {
  try {
    fn()
  } catch (e) {
    return e instanceof PlannerError ? e.code : `non-planner:${e.name}`
  }
  return null
}
const NOW_ISO = new Date(NOW).toISOString()

describe('createDay', () => {
  it('starts as a Normal day with no baseline and no suppressed templates', () => {
    expect(createDay(TODAY)).toEqual({ planDate: TODAY, dayMode: 'normal', baselineAt: null, suppressedTemplateIds: [] })
  })
  it('rejects invalid dates', () => {
    expect(code(() => createDay('2026-02-30'))).toBe(ERR.INVALID_DATE)
  })
})

describe('the three day modes', () => {
  it('are Normal, Busy/Festival and Rest/Recovery', () => {
    expect(DAY_MODES).toEqual({ NORMAL: 'normal', BUSY: 'busy', REST: 'rest' })
    for (const m of ['normal', 'busy', 'rest']) expect(isValidDayMode(m)).toBe(true)
    for (const m of ['festival', 'Normal', '', null, undefined]) expect(isValidDayMode(m)).toBe(false)
  })

  it('Normal -> Busy fixes the baseline (a revision)', () => {
    const r = setDayMode({ day: frozen(makeDay()), mode: 'busy' }, ctx())
    expect(r).toMatchObject({ dayMode: 'busy', baselineAt: NOW_ISO })
  })

  it('Normal -> Rest fixes the baseline too', () => {
    expect(setDayMode({ day: makeDay(), mode: 'rest' }, ctx())).toMatchObject({ dayMode: 'rest', baselineAt: NOW_ISO })
  })

  it('switching back to Normal keeps the baseline already fixed', () => {
    const busy = setDayMode({ day: makeDay(), mode: 'busy' }, ctx())
    const back = setDayMode({ day: busy, mode: 'normal' }, { ...ctx(), now: '2026-03-10T18:00:00Z' })
    expect(back.dayMode).toBe('normal')
    expect(back.baselineAt).toBe(NOW_ISO) // not re-stamped
  })

  it('choosing Normal on a fresh Normal day changes nothing', () => {
    const day = makeDay()
    expect(setDayMode({ day, mode: 'normal' }, ctx())).toBe(day)
  })

  it('choosing the same mode again returns the same day', () => {
    const busy = makeDay({ dayMode: 'busy', baselineAt: '2026-03-10T09:00:00.000Z' })
    expect(setDayMode({ day: busy, mode: 'busy' }, ctx())).toBe(busy)
  })

  it('refuses unknown modes and read-only days', () => {
    expect(code(() => setDayMode({ day: makeDay(), mode: 'festival' }, ctx()))).toBe(ERR.INVALID_DAY_MODE)
    expect(code(() => setDayMode({ day: makeDay({ planDate: '2026-03-03' }), mode: 'busy' }, ctx()))).toBe(ERR.DATE_NOT_EDITABLE)
  })

  it('changing mode never touches tasks: the plan is identical before and after', () => {
    const occurrences = frozen([makeOcc({ completion: 1 }), makeOcc(), makeOcc({ planState: 'excluded', excludedReason: 'busy_day' })])
    const before = JSON.stringify(occurrences)
    const day = setDayMode({ day: makeDay(), mode: 'rest' }, ctx())
    setDayMode({ day, mode: 'normal' }, ctx())
    expect(JSON.stringify(occurrences)).toBe(before)
  })

  it('rest days are identifiable even when they contain tasks, and are not scored as failures', () => {
    const rest = setDayMode({ day: makeDay(), mode: 'rest' }, ctx())
    expect(isRestDay(rest)).toBe(true)
    expect(isRestDay(makeDay())).toBe(false)
    const s = summarizeDay({ day: rest, occurrences: [makeOcc(), makeOcc()] })
    expect(s.isRestDay).toBe(true)
    expect(s.kind).toBe('rest')
  })
})

describe('proposeSetAside (suggestion only)', () => {
  const list = () => [
    makeOcc({ id: 'p', isPriority: true }),
    makeOcc({ id: 'n1' }),
    makeOcc({ id: 'half', completion: 0.5 }),
    makeOcc({ id: 'done', completion: 1 }),
    makeOcc({ id: 'away', planState: 'excluded', excludedReason: 'removed' }),
  ]

  it('Busy: proposes open non-priority tasks, including partial ones, never done or already-aside tasks', () => {
    expect(proposeSetAside({ mode: 'busy', occurrences: frozen(list()) })).toEqual({ reason: 'busy_day', ids: ['n1', 'half'] })
  })

  it('Rest: proposes every open task, including priority ones', () => {
    expect(proposeSetAside({ mode: 'rest', occurrences: list() })).toEqual({ reason: 'rest_day', ids: ['p', 'n1', 'half'] })
  })

  it('Normal: proposes nothing', () => {
    expect(proposeSetAside({ mode: 'normal', occurrences: list() })).toEqual({ reason: null, ids: [] })
  })

  it('rejects unknown modes', () => {
    expect(code(() => proposeSetAside({ mode: 'nope', occurrences: [] }))).toBe(ERR.INVALID_DAY_MODE)
  })

  it('never discards or inflates: applying the proposal keeps every task and the original denominator', () => {
    const occurrences = [makeOcc({ id: 'a', completion: 1, completedAt: NOW_ISO }), makeOcc({ id: 'b' }), makeOcc({ id: 'c' })]
    let day = setDayMode({ day: makeDay(), mode: 'busy' }, ctx())
    const proposal = proposeSetAside({ mode: 'busy', occurrences })
    const after = occurrences.map((o) => {
      if (!proposal.ids.includes(o.id)) return o
      const r = setAside({ occurrence: o, day, reason: proposal.reason }, ctx())
      day = r.day
      return r.occurrence
    })
    expect(after).toHaveLength(3) // nothing discarded
    const s = summarizeDay({ day, occurrences: after })
    expect(s.current).toMatchObject({ count: 1, percent: 100 })
    expect(s.original).toMatchObject({ count: 3, units: 1, percent: 33 }) // not inflated: still 1 of 3
  })
})

describe('baseline and suppression helpers', () => {
  it('stampBaseline is deterministic and idempotent', () => {
    const day = makeDay()
    const stamped = stampBaseline(day, '2026-03-10T09:00:00.000Z')
    expect(stamped.baselineAt).toBe('2026-03-10T09:00:00.000Z')
    expect(stampBaseline(stamped, '2026-03-10T23:00:00.000Z')).toBe(stamped)
    expect(stampBaseline(day, '2026-03-10T09:00:00.000Z')).toEqual(stamped)
    expect(day.baselineAt).toBeNull() // input untouched
  })

  it('suppressTemplate / unsuppressTemplate are idempotent and pure', () => {
    const day = frozen(makeDay())
    const once = suppressTemplate(day, 'a')
    expect(once.suppressedTemplateIds).toEqual(['a'])
    expect(suppressTemplate(once, 'a')).toBe(once)
    expect(suppressTemplate(day, null)).toBe(day)
    expect(unsuppressTemplate(once, 'a').suppressedTemplateIds).toEqual([])
    expect(unsuppressTemplate(once, 'zzz')).toBe(once)
  })
})
