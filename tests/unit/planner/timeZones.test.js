import { describe, expect, it } from 'vitest'
import {
  ERR,
  PlannerError,
  assertTimeZone,
  hasLocalTimePassed,
  isValidTimeZone,
  localDateOf,
  localDayLengthMinutes,
  minutesUntilEndOfLocalDay,
  resolveContext,
  startOfLocalDay,
  toInstantMs,
  zonedDateTimeToInstant,
} from '../../../src/utils/planner/index.js'

const iso = (ms) => new Date(ms).toISOString()
const code = (fn) => {
  try {
    fn()
  } catch (e) {
    return e instanceof PlannerError ? e.code : `non-planner:${e.name}`
  }
  return null
}

describe('timezone name validation (canonical, case-sensitive)', () => {
  it('accepts canonical names, including both spellings of a renamed zone', () => {
    for (const name of ['UTC', 'America/New_York', 'Europe/London', 'Asia/Kolkata', 'Asia/Calcutta', 'Australia/Lord_Howe', 'America/Argentina/Buenos_Aires', 'America/Port-au-Prince', 'Etc/GMT+5']) {
      expect(isValidTimeZone(name), name).toBe(true)
    }
  })

  it('rejects wrong capitalisation, junk, offsets and stray whitespace', () => {
    for (const bad of ['utc', 'america/new_york', 'America/new_york', 'America/New_york', 'asia/kolkata', 'Mars/Olympus', '', ' UTC', 'UTC ', '+05:30', 'America/', '/UTC', 'New York']) {
      expect(isValidTimeZone(bad), JSON.stringify(bad)).toBe(false)
    }
  })

  it('rejects non-strings', () => {
    for (const bad of [null, undefined, 5, {}, [], true]) expect(isValidTimeZone(bad)).toBe(false)
  })

  it('assertTimeZone throws a coded error', () => {
    expect(code(() => assertTimeZone('Mars/Olympus'))).toBe(ERR.INVALID_TIME_ZONE)
    expect(assertTimeZone('UTC')).toBe('UTC')
  })
})

describe('toInstantMs / resolveContext', () => {
  it('accepts Date, milliseconds and ISO strings', () => {
    expect(toInstantMs(0)).toBe(0)
    expect(toInstantMs(new Date('2026-03-10T15:00:00Z'))).toBe(Date.parse('2026-03-10T15:00:00Z'))
    expect(toInstantMs('2026-03-10T15:00:00Z')).toBe(Date.parse('2026-03-10T15:00:00Z'))
  })

  it('rejects invalid instants', () => {
    for (const bad of ['not a date', NaN, Infinity, null, undefined, {}, new Date('x')]) {
      expect(code(() => toInstantMs(bad)), String(bad)).toBe(ERR.INVALID_INSTANT)
    }
  })

  it('derives today from the profile timezone, not the machine', () => {
    const now = '2026-03-10T03:30:00Z'
    expect(resolveContext({ now, timeZone: 'America/New_York' }).today).toBe('2026-03-09')
    expect(resolveContext({ now, timeZone: 'Asia/Kolkata' }).today).toBe('2026-03-10')
    expect(code(() => resolveContext({ now, timeZone: 'new york' }))).toBe(ERR.INVALID_TIME_ZONE)
    expect(code(() => resolveContext({ timeZone: 'UTC' }))).toBe(ERR.INVALID_INSTANT)
  })
})

describe('localDateOf', () => {
  it('returns the local calendar date at an instant', () => {
    expect(localDateOf('2026-03-09T03:30:00Z', 'America/New_York')).toBe('2026-03-08') // 23:30 EDT
    expect(localDateOf('2026-03-09T03:30:00Z', 'UTC')).toBe('2026-03-09')
    expect(localDateOf('2026-03-09T19:00:00Z', 'Asia/Kolkata')).toBe('2026-03-10') // 00:30 IST
    expect(localDateOf('2026-12-31T23:30:00Z', 'Pacific/Auckland')).toBe('2027-01-01')
  })

  it('switches date exactly at local midnight, either side of a DST change', () => {
    // New York spring forward: midnight 2026-03-09 EDT is 04:00Z.
    expect(localDateOf('2026-03-09T03:59:59Z', 'America/New_York')).toBe('2026-03-08')
    expect(localDateOf('2026-03-09T04:00:00Z', 'America/New_York')).toBe('2026-03-09')
    // Fall back: midnight 2026-11-02 EST is 05:00Z.
    expect(localDateOf('2026-11-02T04:59:59Z', 'America/New_York')).toBe('2026-11-01')
    expect(localDateOf('2026-11-02T05:00:00Z', 'America/New_York')).toBe('2026-11-02')
  })
})

describe('daylight saving: nonexistent local times resolve FORWARD', () => {
  it('New York spring-forward gap (02:30 does not exist on 2026-03-08)', () => {
    expect(iso(zonedDateTimeToInstant('2026-03-08', '02:30', 'America/New_York'))).toBe('2026-03-08T07:30:00.000Z') // 03:30 EDT
    expect(iso(zonedDateTimeToInstant('2026-03-08', '02:00', 'America/New_York'))).toBe('2026-03-08T07:00:00.000Z') // 03:00 EDT
    expect(iso(zonedDateTimeToInstant('2026-03-08', '01:59', 'America/New_York'))).toBe('2026-03-08T06:59:00.000Z') // real 01:59 EST
    expect(iso(zonedDateTimeToInstant('2026-03-08', '03:00', 'America/New_York'))).toBe('2026-03-08T07:00:00.000Z')
  })

  it('London spring-forward gap (01:30 does not exist on 2026-03-29)', () => {
    expect(iso(zonedDateTimeToInstant('2026-03-29', '01:30', 'Europe/London'))).toBe('2026-03-29T01:30:00.000Z') // 02:30 BST
  })

  it('Lord Howe shifts by 30 minutes, so the gap is 02:00-02:30', () => {
    expect(iso(zonedDateTimeToInstant('2026-10-04', '02:15', 'Australia/Lord_Howe'))).toBe('2026-10-03T15:45:00.000Z') // 02:45 +11
  })

  it('Havana: midnight itself does not exist, so the day starts at 01:00', () => {
    expect(iso(startOfLocalDay('2026-03-08', 'America/Havana'))).toBe('2026-03-08T05:00:00.000Z')
    expect(localDayLengthMinutes('2026-03-08', 'America/Havana')).toBe(1380)
  })
})

describe('the start of a day when midnight happens twice (found by checking against the server timezone database)', () => {
  // Havana falls back at 01:00 on 1 November 2026, so 00:00 to 01:00 is shown twice and that date is 25 hours long.
  // The date began the FIRST time the clock showed it, not the second.
  it('starts the date at the earlier midnight, so the day before is 24 hours and the day itself 25', () => {
    expect(iso(startOfLocalDay('2026-11-01', 'America/Havana'))).toBe('2026-11-01T04:00:00.000Z') // 00:00 CDT (UTC-4), the first one
    expect(localDayLengthMinutes('2026-10-31', 'America/Havana')).toBe(1440)
    expect(localDayLengthMinutes('2026-11-01', 'America/Havana')).toBe(1500)
    expect(localDayLengthMinutes('2026-11-02', 'America/Havana')).toBe(1440)
  })

  it('a repeated wall-clock TIME still resolves to the later instant (that rule is unchanged)', () => {
    expect(iso(zonedDateTimeToInstant('2026-11-01', '00:30', 'America/Havana'))).toBe('2026-11-01T05:30:00.000Z') // the second 00:30, CST
  })

  it('counts the time left on the repeated day in real elapsed minutes', () => {
    // 00:30 CDT (the first one) on 1 November: 24.5 hours of that 25-hour day remain.
    expect(minutesUntilEndOfLocalDay('2026-11-01T04:30:00Z', 'America/Havana')).toBe(24 * 60 + 30 + 0)
  })

  it('leaves ordinary midnights, gaps and other zones exactly as before', () => {
    expect(iso(startOfLocalDay('2026-03-10', 'America/New_York'))).toBe('2026-03-10T04:00:00.000Z')
    expect(iso(startOfLocalDay('2026-11-01', 'America/New_York'))).toBe('2026-11-01T04:00:00.000Z')
    expect(localDayLengthMinutes('2026-11-01', 'America/New_York')).toBe(1500)
    expect(localDayLengthMinutes('2026-03-08', 'America/New_York')).toBe(1380)
  })
})

describe('daylight saving: ambiguous local times resolve to the LATER instant', () => {
  it('New York fall-back (01:30 happens twice on 2026-11-01)', () => {
    expect(iso(zonedDateTimeToInstant('2026-11-01', '01:30', 'America/New_York'))).toBe('2026-11-01T06:30:00.000Z') // 01:30 EST, not EDT
    expect(iso(zonedDateTimeToInstant('2026-11-01', '01:00', 'America/New_York'))).toBe('2026-11-01T06:00:00.000Z')
  })

  it('times either side of the overlap are unambiguous', () => {
    expect(iso(zonedDateTimeToInstant('2026-11-01', '00:59', 'America/New_York'))).toBe('2026-11-01T04:59:00.000Z') // EDT
    expect(iso(zonedDateTimeToInstant('2026-11-01', '02:00', 'America/New_York'))).toBe('2026-11-01T07:00:00.000Z') // EST
  })

  it('London fall-back (01:30 happens twice on 2026-10-25)', () => {
    expect(iso(zonedDateTimeToInstant('2026-10-25', '01:30', 'Europe/London'))).toBe('2026-10-25T01:30:00.000Z') // GMT
  })
})

describe('ordinary days', () => {
  it('converts a normal time in zones with and without daylight saving', () => {
    expect(iso(zonedDateTimeToInstant('2026-03-07', '12:00', 'America/New_York'))).toBe('2026-03-07T17:00:00.000Z') // EST
    expect(iso(zonedDateTimeToInstant('2026-03-10', '12:00', 'America/New_York'))).toBe('2026-03-10T16:00:00.000Z') // EDT
    expect(iso(zonedDateTimeToInstant('2026-06-01', '09:00', 'Asia/Kolkata'))).toBe('2026-06-01T03:30:00.000Z')
    expect(iso(zonedDateTimeToInstant('2026-06-01', '09:00', 'UTC'))).toBe('2026-06-01T09:00:00.000Z')
  })

  it('rejects invalid input', () => {
    expect(code(() => zonedDateTimeToInstant('2026-02-30', '09:00', 'UTC'))).toBe(ERR.INVALID_DATE)
    expect(code(() => zonedDateTimeToInstant('2026-02-01', '9:00', 'UTC'))).toBe(ERR.INVALID_TIME)
    expect(code(() => zonedDateTimeToInstant('2026-02-01', '09:00', 'utc'))).toBe(ERR.INVALID_TIME_ZONE)
  })
})

describe('real day length and time left today', () => {
  it('local days are 23, 24 or 25 hours (never assumed to be 24)', () => {
    expect(localDayLengthMinutes('2026-03-08', 'America/New_York')).toBe(1380)
    expect(localDayLengthMinutes('2026-11-01', 'America/New_York')).toBe(1500)
    expect(localDayLengthMinutes('2026-03-10', 'America/New_York')).toBe(1440)
    expect(localDayLengthMinutes('2026-03-29', 'Europe/London')).toBe(1380)
    expect(localDayLengthMinutes('2026-10-25', 'Europe/London')).toBe(1500)
    expect(localDayLengthMinutes('2026-10-04', 'Australia/Lord_Howe')).toBe(1410)
    expect(localDayLengthMinutes('2026-04-05', 'Australia/Lord_Howe')).toBe(1470)
    expect(localDayLengthMinutes('2026-03-08', 'Asia/Kolkata')).toBe(1440)
  })

  it('measures time left in real elapsed minutes across a spring-forward night', () => {
    // 01:00 EST on 2026-03-08: the clock reads 23 hours to midnight but only 22 hours elapse.
    expect(minutesUntilEndOfLocalDay('2026-03-08T06:00:00Z', 'America/New_York')).toBe(22 * 60)
    expect(minutesUntilEndOfLocalDay('2026-03-08T08:00:00Z', 'America/New_York')).toBe(20 * 60) // 04:00 EDT
  })

  it('measures time left across a fall-back night', () => {
    // 00:00 EDT on 2026-11-01: a 25-hour day.
    expect(minutesUntilEndOfLocalDay('2026-11-01T04:00:00Z', 'America/New_York')).toBe(25 * 60)
  })

  it('is zero-safe at the boundary and rounds down partial minutes', () => {
    expect(minutesUntilEndOfLocalDay('2026-03-10T03:59:30Z', 'America/New_York')).toBe(0) // 30s before midnight
    expect(minutesUntilEndOfLocalDay('2026-03-10T04:00:00Z', 'America/New_York')).toBe(1440)
  })

  it('knows whether a planned wall-clock time has passed, including through a gap', () => {
    // 02:30 on 2026-03-08 resolves forward to 07:30Z.
    expect(hasLocalTimePassed('2026-03-08T07:29:59Z', '2026-03-08', '02:30', 'America/New_York')).toBe(false)
    expect(hasLocalTimePassed('2026-03-08T07:30:00Z', '2026-03-08', '02:30', 'America/New_York')).toBe(true)
  })
})
