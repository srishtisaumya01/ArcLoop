import { describe, expect, it } from 'vitest'
import {
  ERR,
  PLANNER_CONFIG,
  PlannerError,
  assertCanRecordProgress,
  assertEditableDate,
  classifyDate,
  editableRange,
  isEditableDate,
} from '../../../src/utils/planner/index.js'

const code = (fn) => {
  try {
    fn()
  } catch (e) {
    return e instanceof PlannerError ? e.code : `non-planner:${e.name}`
  }
  return null
}
const T = '2026-03-10'

describe('editable window (D5): 7 dates in total, today plus the previous 6', () => {
  it('has the approved configuration', () => {
    expect(PLANNER_CONFIG.pastEditWindowDates).toBe(7)
    expect(PLANNER_CONFIG.planAheadDays).toBe(30)
  })

  it('computes the range', () => {
    expect(editableRange(T)).toEqual({ earliest: '2026-03-04', latest: '2026-04-09' })
  })

  it('boundary values at the old end: today-6 is editable, today-7 is not', () => {
    expect(classifyDate('2026-03-04', T)).toBe('editable_past')
    expect(classifyDate('2026-03-03', T)).toBe('read_only_past')
    expect(isEditableDate('2026-03-04', T)).toBe(true)
    expect(isEditableDate('2026-03-03', T)).toBe(false)
  })

  it('counts exactly 7 editable dates up to and including today', () => {
    const dates = ['2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10']
    expect(dates.filter((d) => isEditableDate(d, T))).toHaveLength(7)
  })

  it('boundary values at the planning-ahead end (provisional 30 days)', () => {
    expect(classifyDate('2026-04-09', T)).toBe('future') // today + 30
    expect(classifyDate('2026-04-10', T)).toBe('beyond_plan_ahead') // today + 31
    expect(classifyDate('2026-03-11', T)).toBe('future')
    expect(classifyDate(T, T)).toBe('today')
  })

  it('works across month, year and leap boundaries', () => {
    expect(editableRange('2026-03-01').earliest).toBe('2026-02-23')
    expect(editableRange('2028-03-03').earliest).toBe('2028-02-26') // includes leap day 2028-02-29
    expect(editableRange('2027-01-03').earliest).toBe('2026-12-28')
    expect(editableRange('2026-12-15').latest).toBe('2027-01-14')
    expect(editableRange('2028-02-01').latest).toBe('2028-03-02') // 29-day February
  })

  it('is configurable', () => {
    const cfg = { ...PLANNER_CONFIG, pastEditWindowDates: 3, planAheadDays: 5 }
    expect(editableRange(T, cfg)).toEqual({ earliest: '2026-03-08', latest: '2026-03-15' })
    expect(classifyDate('2026-03-07', T, cfg)).toBe('read_only_past')
    expect(classifyDate('2026-03-16', T, cfg)).toBe('beyond_plan_ahead')
  })

  it('assertEditableDate throws coded errors', () => {
    expect(code(() => assertEditableDate('2026-03-03', T))).toBe(ERR.DATE_NOT_EDITABLE)
    expect(code(() => assertEditableDate('2026-04-10', T))).toBe(ERR.BEYOND_PLAN_AHEAD)
    expect(code(() => assertEditableDate('2026-03-04', T))).toBeNull()
    expect(code(() => assertEditableDate('2026-04-09', T))).toBeNull()
  })

  it('progress can be recorded up to today but never in the future', () => {
    expect(code(() => assertCanRecordProgress(T, T))).toBeNull()
    expect(code(() => assertCanRecordProgress('2026-03-04', T))).toBeNull()
    expect(code(() => assertCanRecordProgress('2026-03-11', T))).toBe(ERR.FUTURE_DATE)
    expect(code(() => assertCanRecordProgress('2026-03-03', T))).toBe(ERR.DATE_NOT_EDITABLE)
  })

  it('rejects invalid dates', () => {
    expect(code(() => classifyDate('2026-02-30', T))).toBe(ERR.INVALID_DATE)
  })
})
