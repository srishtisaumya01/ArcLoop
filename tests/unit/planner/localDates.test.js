import { describe, expect, it } from 'vitest'
import {
  ERR,
  PlannerError,
  addDays,
  compareDates,
  diffDays,
  isLeapYear,
  isValidDate,
  isValidTime,
  isoWeekday,
  parseDate,
  parseTime,
  startOfWeek,
  weekDates,
} from '../../../src/utils/planner/index.js'

const code = (fn) => {
  try {
    fn()
  } catch (e) {
    return e instanceof PlannerError ? e.code : `non-planner:${e.name}`
  }
  return null
}

describe('parseDate / isValidDate', () => {
  it('accepts real calendar dates including leap days', () => {
    expect(parseDate('2026-10-17')).toEqual({ year: 2026, month: 10, day: 17 })
    expect(isValidDate('2028-02-29')).toBe(true)
    expect(isValidDate('2000-02-29')).toBe(true)
  })

  it('rejects impossible dates', () => {
    for (const bad of ['2026-02-30', '2026-04-31', '2026-13-01', '2026-00-10', '2026-01-00', '2100-02-29', '2026-02-29']) {
      expect(code(() => parseDate(bad)), bad).toBe(ERR.INVALID_DATE)
    }
  })

  it('rejects wrong formats and non-strings', () => {
    for (const bad of ['2026-1-1', '26-01-01', '2026/01/01', '2026-01-01T00:00:00Z', ' 2026-01-01', '', null, undefined, 20260101, new Date()]) {
      expect(isValidDate(bad), String(bad)).toBe(false)
    }
  })
})

describe('addDays (calendar arithmetic, never 24-hour steps)', () => {
  it('crosses month boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-04-30', 1)).toBe('2026-05-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('crosses year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
  })

  it('handles leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01')
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2100-02-28', 1)).toBe('2100-03-01')
    expect(addDays('2028-01-01', 366)).toBe('2029-01-01')
    expect(addDays('2026-01-01', 365)).toBe('2027-01-01')
  })

  it('advances exactly one calendar date across daylight-saving changes in any zone', () => {
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08')
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02')
  })

  it('is its own inverse and handles zero', () => {
    expect(addDays('2026-06-15', 0)).toBe('2026-06-15')
    expect(addDays(addDays('2026-06-15', 200), -200)).toBe('2026-06-15')
  })

  it('rejects bad input', () => {
    expect(code(() => addDays('2026-02-30', 1))).toBe(ERR.INVALID_DATE)
    expect(code(() => addDays('2026-01-01', 1.5))).toBe(ERR.INVALID_ARGUMENT)
    expect(code(() => addDays('2026-01-01', '1'))).toBe(ERR.INVALID_ARGUMENT)
    expect(code(() => addDays('9999-12-31', 1))).toBe(ERR.INVALID_DATE)
  })
})

describe('diffDays / compareDates', () => {
  it('counts calendar days, ignoring daylight saving', () => {
    expect(diffDays('2026-03-07', '2026-03-09')).toBe(2)
    expect(diffDays('2026-11-01', '2026-11-02')).toBe(1)
    expect(diffDays('2028-02-28', '2028-03-01')).toBe(2)
    expect(diffDays('2026-05-10', '2026-05-01')).toBe(-9)
    expect(diffDays('2026-05-01', '2026-05-01')).toBe(0)
  })

  it('compares dates', () => {
    expect(compareDates('2026-01-01', '2026-01-02')).toBe(-1)
    expect(compareDates('2026-01-02', '2026-01-01')).toBe(1)
    expect(compareDates('2026-01-01', '2026-01-01')).toBe(0)
    expect(compareDates('2025-12-31', '2026-01-01')).toBe(-1)
  })
})

describe('weekdays and Monday-start weeks (D8)', () => {
  it('returns ISO weekdays 1 (Monday) to 7 (Sunday)', () => {
    expect(isoWeekday('2026-10-19')).toBe(1) // Monday
    expect(isoWeekday('2026-10-17')).toBe(6) // Saturday
    expect(isoWeekday('2026-10-18')).toBe(7) // Sunday
    expect(isoWeekday('2028-02-29')).toBe(2) // Tuesday (leap day)
  })

  it('finds the Monday that starts a week', () => {
    expect(startOfWeek('2026-10-19')).toBe('2026-10-19')
    expect(startOfWeek('2026-10-18')).toBe('2026-10-12') // Sunday belongs to the week before
    expect(startOfWeek('2026-10-17')).toBe('2026-10-12')
    expect(startOfWeek('2027-01-01')).toBe('2026-12-28') // across the year boundary
  })

  it('lists Monday to Sunday', () => {
    const week = weekDates('2026-12-31')
    expect(week).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'])
    expect(weekDates('2028-02-29')[0]).toBe('2028-02-28')
    expect(weekDates('2028-02-29')[6]).toBe('2028-03-05')
  })

  it('supports another week start only when asked, and rejects invalid ones', () => {
    expect(startOfWeek('2026-10-17', 7)).toBe('2026-10-11') // Sunday start
    expect(code(() => startOfWeek('2026-10-17', 0))).toBe(ERR.INVALID_ARGUMENT)
    expect(code(() => startOfWeek('2026-10-17', 8))).toBe(ERR.INVALID_ARGUMENT)
  })
})

describe('times and leap years', () => {
  it('parses HH:MM', () => {
    expect(parseTime('00:00')).toBe(0)
    expect(parseTime('09:30')).toBe(570)
    expect(parseTime('23:59')).toBe(1439)
  })

  it('rejects malformed times', () => {
    for (const bad of ['24:00', '9:30', '12:60', '12:30:00', '12.30', '', null, undefined, 930]) {
      expect(isValidTime(bad), String(bad)).toBe(false)
    }
    expect(code(() => parseTime('25:00'))).toBe(ERR.INVALID_TIME)
  })

  it('knows leap years', () => {
    expect(isLeapYear(2024)).toBe(true)
    expect(isLeapYear(2000)).toBe(true)
    expect(isLeapYear(1900)).toBe(false)
    expect(isLeapYear(2100)).toBe(false)
    expect(isLeapYear(2026)).toBe(false)
  })
})
