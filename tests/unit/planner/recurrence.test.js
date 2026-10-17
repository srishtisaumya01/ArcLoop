import { describe, expect, it } from 'vitest'
import { ERR, PlannerError, occurrenceDatesBetween, occursOn } from '../../../src/utils/planner/index.js'
import { makeTemplate } from './fixtures.js'

const code = (fn) => {
  try {
    fn()
  } catch (e) {
    return e instanceof PlannerError ? e.code : `non-planner:${e.name}`
  }
  return null
}

const once = (date) => makeTemplate({ recurrence: 'once', startsOn: date, endsOn: date })
const weekly = (weekdays, extra = {}) => makeTemplate({ recurrence: 'weekly', weekdays, ...extra })

describe('one-time tasks', () => {
  it('occur on their date only', () => {
    const t = once('2026-03-10')
    expect(occursOn(t, '2026-03-10')).toBe(true)
    expect(occursOn(t, '2026-03-09')).toBe(false)
    expect(occursOn(t, '2026-03-11')).toBe(false)
    expect(occursOn(t, '2027-03-10')).toBe(false)
  })

  it('can sit on a leap day', () => {
    const t = once('2028-02-29')
    expect(occursOn(t, '2028-02-29')).toBe(true)
    expect(occursOn(t, '2028-03-01')).toBe(false)
  })
})

describe('daily tasks', () => {
  it('start on startsOn (inclusive) and never before', () => {
    const t = makeTemplate({ startsOn: '2026-03-10' })
    expect(occursOn(t, '2026-03-09')).toBe(false)
    expect(occursOn(t, '2026-03-10')).toBe(true)
    expect(occursOn(t, '2031-01-01')).toBe(true)
  })

  it('stop after endsOn (inclusive)', () => {
    const t = makeTemplate({ startsOn: '2026-03-10', endsOn: '2026-03-12' })
    expect(occursOn(t, '2026-03-12')).toBe(true)
    expect(occursOn(t, '2026-03-13')).toBe(false)
  })

  it('include every day across month, year and leap boundaries', () => {
    const t = makeTemplate({ startsOn: '2026-01-01' })
    expect(occurrenceDatesBetween(t, '2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'])
    expect(occurrenceDatesBetween(t, '2028-02-27', '2028-03-01')).toEqual(['2028-02-27', '2028-02-28', '2028-02-29', '2028-03-01'])
    expect(occurrenceDatesBetween(t, '2027-02-27', '2027-03-01')).toEqual(['2027-02-27', '2027-02-28', '2027-03-01'])
  })

  it('do not skip or repeat a date on daylight-saving change days', () => {
    const t = makeTemplate({ startsOn: '2026-01-01' })
    expect(occurrenceDatesBetween(t, '2026-03-07', '2026-03-10')).toEqual(['2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10'])
    expect(occurrenceDatesBetween(t, '2026-10-31', '2026-11-03')).toEqual(['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03'])
  })
})

describe('selected-weekday tasks (ISO 1 = Monday ... 7 = Sunday)', () => {
  it('occur only on the chosen weekdays', () => {
    const t = weekly([1, 3, 5], { startsOn: '2026-10-01' })
    // 2026-10-19 Mon, 20 Tue, 21 Wed, 22 Thu, 23 Fri, 24 Sat, 25 Sun
    expect(occurrenceDatesBetween(t, '2026-10-19', '2026-10-25')).toEqual(['2026-10-19', '2026-10-21', '2026-10-23'])
  })

  it('treat Sunday as 7 and Monday as 1', () => {
    expect(occursOn(weekly([7]), '2026-10-18')).toBe(true) // Sunday
    expect(occursOn(weekly([7]), '2026-10-19')).toBe(false)
    expect(occursOn(weekly([1]), '2026-10-19')).toBe(true) // Monday
  })

  it('cross the year boundary on the right weekdays', () => {
    const t = weekly([4, 5], { startsOn: '2026-01-01' }) // Thursday, Friday
    expect(occurrenceDatesBetween(t, '2026-12-28', '2027-01-03')).toEqual(['2026-12-31', '2027-01-01'])
  })

  it('land on a leap day when it falls on a chosen weekday', () => {
    const t = weekly([2], { startsOn: '2028-01-01' }) // 2028-02-29 is a Tuesday
    expect(occursOn(t, '2028-02-29')).toBe(true)
    expect(occurrenceDatesBetween(t, '2028-02-22', '2028-03-07')).toEqual(['2028-02-22', '2028-02-29', '2028-03-07'])
  })

  it('respect startsOn and endsOn', () => {
    const t = weekly([1], { startsOn: '2026-10-19', endsOn: '2026-10-26' })
    expect(occurrenceDatesBetween(t, '2026-10-01', '2026-11-30')).toEqual(['2026-10-19', '2026-10-26'])
  })

  it('produce no dates when no weekday is configured', () => {
    expect(occurrenceDatesBetween(weekly([]), '2026-10-01', '2026-10-31')).toEqual([])
    expect(occursOn(makeTemplate({ recurrence: 'weekly', weekdays: null }), '2026-10-19')).toBe(false)
  })
})

describe('occurrenceDatesBetween', () => {
  it('is ascending, has no duplicates and includes both ends', () => {
    const dates = occurrenceDatesBetween(makeTemplate(), '2026-05-01', '2026-05-10')
    expect(dates).toHaveLength(10)
    expect(new Set(dates).size).toBe(10)
    expect([...dates].sort()).toEqual(dates)
  })

  it('returns an empty list for a reversed range and one date for a single-day range', () => {
    expect(occurrenceDatesBetween(makeTemplate(), '2026-05-10', '2026-05-01')).toEqual([])
    expect(occurrenceDatesBetween(makeTemplate(), '2026-05-10', '2026-05-10')).toEqual(['2026-05-10'])
  })

  it('refuses unreasonably long ranges', () => {
    expect(code(() => occurrenceDatesBetween(makeTemplate(), '2020-01-01', '2026-01-01'))).toBe(ERR.INVALID_ARGUMENT)
  })
})

describe('invalid input', () => {
  it('rejects invalid dates, unknown recurrence and missing templates', () => {
    expect(code(() => occursOn(makeTemplate(), '2026-02-30'))).toBe(ERR.INVALID_DATE)
    expect(code(() => occursOn(makeTemplate({ recurrence: 'monthly' }), '2026-03-10'))).toBe(ERR.INVALID_TEMPLATE)
    expect(code(() => occursOn(null, '2026-03-10'))).toBe(ERR.INVALID_TEMPLATE)
  })
})
