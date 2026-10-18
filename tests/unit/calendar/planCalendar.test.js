import { describe, expect, it } from 'vitest'
import { planForRange, zonedDateTimeToInstant } from '../../../src/utils/planner/index.js'
import { ALERT_CHOICES, buildPlanCalendar } from '../../../src/utils/calendar/planCalendar.js'
import { CRLF } from '../../../src/utils/calendar/icsText.js'
import { parseIcs } from '../../support/icsParse.js'
import { makeDay, makeOcc, makeTemplate } from '../planner/fixtures.js'

// Calendar export: dates, timezones, daylight saving and repeating tasks, each checked by reading the file back with an
// independent iCalendar parser. Expected instants are worked out here from the stated UTC offsets (not by the code under
// test), so a wrong conversion cannot agree with itself.
//
// These are chosen cases, not a proof that every zone and date converts correctly. Exported events are a request to a
// calendar app; nothing here (or anywhere) shows that an app will notify anyone.

const NOW = Date.parse('2026-03-10T15:00:00Z')
const utc = (y, m, d, h = 0, min = 0) => new Date(Date.UTC(y, m - 1, d, h, min)).toISOString()
const at = (offsetMinutes, y, m, d, h, min = 0) => new Date(Date.UTC(y, m - 1, d, h, min) - offsetMinutes * 60000).toISOString() // local wall time at a UTC offset

// A plan the way getCalendarPlan makes it, from templates and day records, with `today` and `timeZone` given.
function planOf({ today, to, timeZone = 'America/New_York', templates = [], days = [] }) {
  // "Now" is local noon on `today` in that zone, so today IS that date for the person (UTC noon would already be tomorrow in
  // Auckland). Only the clock uses the planner's conversion; every expected time below is worked out independently.
  const now = zonedDateTimeToInstant(today, '12:00', timeZone)
  return { timeZone, today, from: today, to, days: planForRange({ from: today, to, templates, days }, { now, timeZone }) }
}
const calendar = (plan, options = {}) => {
  const built = buildPlanCalendar({ plan, options, now: NOW })
  return { ...built, ...parseIcs(built.text) }
}
const timed = (extra = {}) => makeTemplate({ plannedStart: '09:00', ...extra })

describe('the file itself', () => {
  it('is a well-formed calendar that an independent parser reads, with CRLF lines of at most 75 octets', () => {
    const file = calendar(planOf({ today: '2026-03-10', to: '2026-03-12', templates: [timed({ id: 'walk', title: 'Walk' })] }))
    expect(file).toMatchObject({ version: '2.0', method: 'PUBLISH', name: 'Arcloop plan' })
    expect(file.prodid).toBe('-//Arcloop//Plan export//EN')
    expect(file.text.endsWith(CRLF)).toBe(true)
    expect(file.text.replaceAll(CRLF, '')).not.toMatch(/[\r\n]/)
    for (const line of file.text.split(CRLF)) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    expect(file.events).toHaveLength(3)
  })

  it('stamps the file with the moment it was made, and is byte-for-byte repeatable', () => {
    const plan = planOf({ today: '2026-03-10', to: '2026-03-14', templates: [timed({ id: 'a', title: 'A' }), timed({ id: 'b', title: 'B', plannedStart: '08:00' })] })
    expect(calendar(plan).events.every((e) => e.stamp === utc(2026, 3, 10, 15))).toBe(true)
    expect(buildPlanCalendar({ plan, now: NOW }).text).toBe(buildPlanCalendar({ plan, now: NOW }).text)
  })

  it('writes every time as UTC and never needs a time-zone definition inside the file', () => {
    const file = calendar(planOf({ today: '2026-03-10', to: '2026-03-11', templates: [timed({ id: 'a' })] }))
    expect(file.hasTimezoneComponent).toBe(false)
    expect(file.text).not.toMatch(/TZID|VTIMEZONE/)
    expect(file.events.every((e) => e.tzid === null && e.start.endsWith('Z'))).toBe(true)
  })

  it('is still a valid calendar when there is nothing to export', () => {
    const file = calendar(planOf({ today: '2026-03-10', to: '2026-03-12' }))
    expect(file.events).toEqual([])
    expect(file.version).toBe('2.0')
  })

  it('names the file after its date range', () => {
    expect(calendar(planOf({ today: '2026-03-10', to: '2026-03-23' })).filename).toBe('arcloop-plan-2026-03-10-to-2026-03-23.ics')
  })
})

describe('timed events: start, end and duration', () => {
  const one = (template) => calendar(planOf({ today: '2026-03-10', to: '2026-03-10', templates: [template] })).events[0]

  it('uses the planned end when there is one', () => {
    expect(one(timed({ id: 't', plannedEnd: '09:45', estimatedMinutes: 20 }))).toMatchObject({ start: at(-240, 2026, 3, 10, 9), end: at(-240, 2026, 3, 10, 9, 45) })
  })

  it('otherwise adds the estimate to the start', () => {
    expect(one(timed({ id: 't', estimatedMinutes: 20 }))).toMatchObject({ start: utc(2026, 3, 10, 13), end: utc(2026, 3, 10, 13, 20) })
  })

  it('and with neither writes no end at all instead of inventing a duration', () => {
    expect(one(timed({ id: 't' }))).toMatchObject({ start: utc(2026, 3, 10, 13), end: null })
  })

  it('keeps the title, notes, category and priority, and says it came from Arcloop without promising updates', () => {
    const event = one(timed({ id: 't', title: 'Gym', description: 'Legs day', category: 'Health', isPriority: true, estimatedMinutes: 60 }))
    expect(event).toMatchObject({ summary: 'Gym', categories: 'Health', priority: 1 })
    expect(event.description).toBe('Legs day\nEstimate: 60 min\nFrom your Arcloop plan. Changes in Arcloop do not update this event.')
    expect(one(timed({ id: 'u' })).priority).toBeNull()
    expect(one(timed({ id: 'u' })).description).toBe('From your Arcloop plan. Changes in Arcloop do not update this event.')
  })

  it('survives awkward text: commas, semicolons, backslashes, line breaks, emoji and very long titles', () => {
    const title = 'Call Dr. Smith, re: x; y \\ z 😀 日本語'
    const notes = `Line one\nLine two, with; punctuation\r\n${'long '.repeat(80)}end`
    const event = one(timed({ id: 't', title, description: notes, category: 'Health, family' }))
    expect(event.summary).toBe(title)
    expect(event.description.startsWith(notes.replace(/\r\n/g, '\n'))).toBe(true)
    expect(event.categories).toBe('Health, family')
    expect(one(timed({ id: 'l', title: 'x'.repeat(300) })).summary).toBe('x'.repeat(300))
  })
})

describe('the same wall-clock time in different timezones (09:00 on 10 March 2026)', () => {
  // Offsets in minutes at that date: New York is on daylight time (UTC-4), Auckland on summer time (UTC+13), etc.
  const ZONES = [
    ['UTC', 0], ['America/New_York', -240], ['Europe/London', 0], ['Asia/Kolkata', 330], ['Asia/Kathmandu', 345],
    ['Pacific/Auckland', 780], ['Pacific/Chatham', 825], ['Pacific/Kiritimati', 840], ['Pacific/Pago_Pago', -660], ['Australia/Lord_Howe', 660], ['America/Sao_Paulo', -180],
  ]
  it.each(ZONES)('%s', (timeZone, offset) => {
    const plan = planOf({ today: '2026-03-10', to: '2026-03-10', timeZone, templates: [timed({ id: 't' })] })
    expect(calendar(plan).events[0].start).toBe(at(offset, 2026, 3, 10, 9))
  })

  it('a time near local midnight lands on the correct UTC date, either side', () => {
    const cases = [
      ['Pacific/Kiritimati', '00:15', at(840, 2026, 3, 10, 0, 15)], // 10:15Z on the 9th
      ['Pacific/Pago_Pago', '23:45', at(-660, 2026, 3, 10, 23, 45)], // 10:45Z on the 11th
      ['America/New_York', '23:30', at(-240, 2026, 3, 10, 23, 30)], // 03:30Z on the 11th
      ['Asia/Kolkata', '00:30', at(330, 2026, 3, 10, 0, 30)], // 19:00Z on the 9th
    ]
    for (const [timeZone, plannedStart, expected] of cases) {
      const plan = planOf({ today: '2026-03-10', to: '2026-03-10', timeZone, templates: [timed({ id: 't', plannedStart })] })
      expect(calendar(plan).events[0].start, `${timeZone} ${plannedStart}`).toBe(expected)
    }
    expect(at(840, 2026, 3, 10, 0, 15)).toBe('2026-03-09T10:15:00.000Z') // the arithmetic really does cross the UTC date
  })

  it('the date the event belongs to is the person’s local date, whatever the UTC date', () => {
    const plan = planOf({ today: '2026-03-10', to: '2026-03-11', timeZone: 'Pacific/Auckland', templates: [timed({ id: 't', plannedStart: '07:00' })] })
    expect(calendar(plan).events.map((e) => e.start)).toEqual([at(780, 2026, 3, 10, 7), at(780, 2026, 3, 11, 7)]) // 18:00Z on the 9th and the 10th
  })
})

describe('daylight saving', () => {
  it('a daily 09:00 task moves from 14:00Z to 13:00Z the day New York changes its clocks (8 March 2026), and not before', () => {
    const plan = planOf({ today: '2026-03-06', to: '2026-03-10', templates: [timed({ id: 'walk', startsOn: '2026-03-01' })] })
    expect(calendar(plan).events.map((e) => e.start)).toEqual([
      utc(2026, 3, 6, 14), utc(2026, 3, 7, 14), // EST, UTC-5
      utc(2026, 3, 8, 13), utc(2026, 3, 9, 13), utc(2026, 3, 10, 13), // EDT, UTC-4
    ])
  })

  it('and moves back the other way on 1 November 2026', () => {
    const plan = planOf({ today: '2026-10-30', to: '2026-11-03', templates: [timed({ id: 'walk', startsOn: '2026-10-01' })] })
    expect(calendar(plan).events.map((e) => e.start)).toEqual([utc(2026, 10, 30, 13), utc(2026, 10, 31, 13), utc(2026, 11, 1, 14), utc(2026, 11, 2, 14), utc(2026, 11, 3, 14)])
  })

  it('a task at a time that does not exist (02:30 on 8 March in New York) is placed forward, at 03:30 daylight time', () => {
    const plan = planOf({ today: '2026-03-08', to: '2026-03-08', templates: [timed({ id: 't', plannedStart: '02:30', plannedEnd: '02:50' })] })
    expect(calendar(plan).events[0]).toMatchObject({ start: utc(2026, 3, 8, 7, 30), end: utc(2026, 3, 8, 7, 50) })
  })

  it('a task at a time that happens twice (01:30 on 1 November) is placed at the later one, and its end is never before its start', () => {
    const plan = planOf({ today: '2026-11-01', to: '2026-11-01', templates: [timed({ id: 't', plannedStart: '01:30', plannedEnd: '01:45' })] })
    expect(calendar(plan).events[0]).toMatchObject({ start: utc(2026, 11, 1, 6, 30), end: utc(2026, 11, 1, 6, 45) }) // 01:30 EST, not EDT
    const across = planOf({ today: '2026-03-08', to: '2026-03-08', templates: [timed({ id: 'u', plannedStart: '01:50', plannedEnd: '02:10' })] })
    const event = calendar(across).events[0]
    expect(Date.parse(event.end)).toBeGreaterThan(Date.parse(event.start)) // an end pushed across the skipped hour stays after the start
  })

  it('a half-hour daylight-saving zone (Lord Howe) follows its own shift', () => {
    const plan = planOf({ today: '2026-04-03', to: '2026-04-06', timeZone: 'Australia/Lord_Howe', templates: [timed({ id: 't', startsOn: '2026-04-01' })] }) // summer time ends on 5 April
    expect(calendar(plan).events.map((e) => e.start)).toEqual([at(660, 2026, 4, 3, 9), at(660, 2026, 4, 4, 9), at(630, 2026, 4, 5, 9), at(630, 2026, 4, 6, 9)])
  })
})

describe('repeating tasks', () => {
  it('a weekly Tuesday and Thursday task appears only on those local days', () => {
    const plan = planOf({ today: '2026-03-10', to: '2026-03-23', templates: [timed({ id: 'gym', title: 'Gym', recurrence: 'weekly', weekdays: [2, 4], plannedStart: '18:00', startsOn: '2026-03-01' })] })
    expect(calendar(plan).events.map((e) => e.start)).toEqual([utc(2026, 3, 10, 22), utc(2026, 3, 12, 22), utc(2026, 3, 17, 22), utc(2026, 3, 19, 22)])
  })

  it('a task whose local date is a different weekday from the UTC date lands on the right local day (Auckland, Monday 07:00)', () => {
    const plan = planOf({ today: '2026-03-09', to: '2026-03-15', timeZone: 'Pacific/Auckland', templates: [timed({ id: 'm', recurrence: 'weekly', weekdays: [1], plannedStart: '07:00', startsOn: '2026-03-01' })] })
    expect(calendar(plan).events.map((e) => e.start)).toEqual([at(780, 2026, 3, 9, 7)]) // Monday the 9th at 07:00 NZDT = 18:00Z on Sunday the 8th
    expect(at(780, 2026, 3, 9, 7)).toBe('2026-03-08T18:00:00.000Z')
  })

  it('a one-off task is one event; a task that has not started yet, or has ended, is not exported on those days', () => {
    const plan = planOf({
      today: '2026-03-10',
      to: '2026-03-16',
      templates: [
        timed({ id: 'once', recurrence: 'once', startsOn: '2026-03-12', endsOn: '2026-03-12', plannedStart: '10:00' }),
        timed({ id: 'later', startsOn: '2026-03-14', plannedStart: '11:00' }),
        timed({ id: 'ended', startsOn: '2026-03-01', endsOn: '2026-03-11', plannedStart: '12:00' }),
      ],
    })
    const starts = calendar(plan).events.map((e) => [e.start, e.uid.split('-')[1]])
    expect(starts).toEqual([
      [utc(2026, 3, 10, 16), 'ended'], [utc(2026, 3, 11, 16), 'ended'], // inclusive end date
      [utc(2026, 3, 12, 14), 'once'],
      [utc(2026, 3, 14, 15), 'later'], [utc(2026, 3, 15, 15), 'later'], [utc(2026, 3, 16, 15), 'later'],
    ])
  })

  it('a repeating task already on a day (opened, edited for that day) is the saved task, written once, with its own time', () => {
    const day = makeDay({ planDate: '2026-03-11' })
    const edited = makeOcc({ templateId: 'walk', planDate: '2026-03-11', title: 'Walk (moved earlier)', plannedStart: '06:30', isCustomized: true })
    const plan = planOf({ today: '2026-03-10', to: '2026-03-12', templates: [timed({ id: 'walk', title: 'Walk' })], days: [{ day, occurrences: [edited] }] })
    const events = calendar(plan).events
    expect(events.map((e) => [e.summary, e.start])).toEqual([['Walk', utc(2026, 3, 10, 13)], ['Walk (moved earlier)', utc(2026, 3, 11, 10, 30)], ['Walk', utc(2026, 3, 12, 13)]])
  })

  it('leaves out what is not part of the plan: set-aside, moved and removed tasks, and a repeating task hidden for that day', () => {
    const day = makeDay({ planDate: '2026-03-11', suppressedTemplateIds: ['hidden'] })
    const occurrences = [
      makeOcc({ planDate: '2026-03-11', title: 'Kept', plannedStart: '08:00' }),
      makeOcc({ planDate: '2026-03-11', title: 'Set aside', plannedStart: '09:00', planState: 'excluded', excludedReason: 'busy_day' }),
      makeOcc({ planDate: '2026-03-11', title: 'Moved', plannedStart: '10:00', planState: 'excluded', excludedReason: 'rescheduled' }),
      makeOcc({ planDate: '2026-03-11', title: 'Removed', plannedStart: '11:00', planState: 'excluded', excludedReason: 'removed' }),
    ]
    const plan = planOf({ today: '2026-03-10', to: '2026-03-11', templates: [timed({ id: 'hidden', title: 'Hidden for the day', startsOn: '2026-03-11' })], days: [{ day, occurrences }] })
    expect(calendar(plan).events.map((e) => e.summary)).toEqual(['Kept'])
  })

  it('a task already done today is still in the plan for today; yesterday is history and is never exported', () => {
    const today = makeDay({ planDate: '2026-03-10' })
    const yesterday = makeDay({ planDate: '2026-03-09' })
    const plan = planOf({
      today: '2026-03-10',
      to: '2026-03-10',
      days: [
        { day: today, occurrences: [makeOcc({ planDate: '2026-03-10', title: 'Done already', plannedStart: '07:00', completion: 1 })] },
        { day: yesterday, occurrences: [makeOcc({ planDate: '2026-03-09', title: 'Yesterday', plannedStart: '07:00' })] },
      ],
    })
    expect(calendar(plan).events.map((e) => e.summary)).toEqual(['Done already'])
    expect(planForRange({ from: '2026-03-01', to: '2026-03-10', days: [] }, { now: NOW, timeZone: 'America/New_York' })[0].date).toBe('2026-03-10') // a start in the past is moved to today
  })
})

describe('tasks without a time', () => {
  const plan = () => planOf({ today: '2026-03-30', to: '2026-03-31', templates: [makeTemplate({ id: 'u', title: 'Water plants', startsOn: '2026-03-01' }), timed({ id: 't', title: 'Walk', startsOn: '2026-03-01' })] })

  it('are left out by default, and the count says how many', () => {
    const file = calendar(plan())
    expect(file.events.map((e) => e.summary)).toEqual(['Walk', 'Walk'])
    expect(file.untimedLeftOut).toBe(2)
  })

  it('become all-day events, the whole local day, when asked for, without ever blocking time', () => {
    const file = calendar(plan(), { includeUntimed: true })
    const allDay = file.events.filter((e) => e.allDay)
    expect(allDay.map((e) => [e.summary, e.start, e.end, e.transp])).toEqual([
      ['Water plants', '2026-03-30', '2026-03-31', 'TRANSPARENT'],
      ['Water plants', '2026-03-31', '2026-04-01', 'TRANSPARENT'], // the exclusive end rolls over the month
    ])
    expect(file.untimedLeftOut).toBe(0)
  })

  it('get no alert even if one is requested: an all-day event has no moment to alert at', () => {
    const file = calendar(plan(), { includeUntimed: true, alertMinutes: 10 })
    expect(file.events.filter((e) => e.allDay).every((e) => e.alarms.length === 0)).toBe(true)
    expect(file.events.filter((e) => !e.allDay).every((e) => e.alarms.length === 1)).toBe(true)
  })
})

describe('alerts are a request, off unless asked for', () => {
  const plan = () => planOf({ today: '2026-03-10', to: '2026-03-10', templates: [timed({ id: 't', title: 'Walk' })] })

  it('writes none by default, and says so in the file: no VALARM anywhere', () => {
    expect(calendar(plan()).events[0].alarms).toEqual([])
    expect(calendar(plan()).text).not.toMatch(/VALARM/)
  })

  it('writes a display alert the chosen number of minutes before the start', () => {
    expect(calendar(plan(), { alertMinutes: 15 }).events[0].alarms).toEqual([{ action: 'DISPLAY', trigger: '-PT15M', description: 'Walk' }])
    expect(calendar(plan(), { alertMinutes: 0 }).events[0].alarms[0].trigger).toBe('PT0S')
    expect(calendar(plan(), { alertMinutes: 60 }).events[0].alarms[0].trigger).toBe('-PT60M')
  })

  it('refuses a number of minutes that is not on offer, instead of writing a strange file', () => {
    for (const bad of [7, -5, 1000, '10', NaN]) expect(() => calendar(plan(), { alertMinutes: bad }), String(bad)).toThrow(RangeError)
    expect(ALERT_CHOICES).toEqual([null, 0, 5, 10, 15, 30, 60])
  })
})

describe('identity and order', () => {
  it('a repeating task has the same event id on a date whether the day is still projected or already opened', () => {
    const projected = calendar(planOf({ today: '2026-03-10', to: '2026-03-11', templates: [timed({ id: 'tpl-1' })] })).events[1].uid
    const day = makeDay({ planDate: '2026-03-11' })
    const opened = calendar(planOf({ today: '2026-03-10', to: '2026-03-11', templates: [timed({ id: 'tpl-1' })], days: [{ day, occurrences: [makeOcc({ templateId: 'tpl-1', planDate: '2026-03-11', plannedStart: '09:00' })] }] })).events[1].uid
    expect(opened).toBe(projected)
    expect(projected).toBe('t-tpl-1-2026-03-11@arcloop')
  })

  it('every event has its own id: different days, different tasks, and one-off tasks with no template', () => {
    const day = makeDay({ planDate: '2026-03-10' })
    const plan = planOf({
      today: '2026-03-10',
      to: '2026-03-12',
      templates: [timed({ id: 'a' }), timed({ id: 'b' })],
      days: [{ day, occurrences: [makeOcc({ id: 'one-off', planDate: '2026-03-10', plannedStart: '08:00', title: 'Once' })] }],
    })
    const ids = calendar(plan).events.map((e) => e.uid)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('o-one-off@arcloop')
  })

  it('events are in time order, with a stable order for events at the same moment', () => {
    const plan = planOf({ today: '2026-03-10', to: '2026-03-11', templates: [timed({ id: 'late', title: 'Late', plannedStart: '20:00' }), timed({ id: 'early', title: 'Early', plannedStart: '06:00' }), timed({ id: 'same-b', title: 'B', plannedStart: '12:00' }), timed({ id: 'same-a', title: 'A', plannedStart: '12:00' })] })
    expect(calendar(plan).events.map((e) => e.summary)).toEqual(['Early', 'A', 'B', 'Late', 'Early', 'A', 'B', 'Late'])
  })
})
