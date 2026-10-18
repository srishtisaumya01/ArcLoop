import { beforeAll, describe, expect, it } from 'vitest'
import { buildPlanCalendar } from '../../src/utils/calendar/planCalendar.js'
import { parseIcs } from '../support/icsParse.js'
import { countRows, createPerson, createWorld, setClock } from './harness.js'

// The calendar export through the real planner service and the real server: real saved days, a moved task, a set-aside task,
// repeating tasks, other people's data, and the clock placed at awkward moments. The file is read back with an independent
// parser. Chosen cases, not a proof for every zone and date; and an exported event is a request to a calendar app, never a
// guarantee that anyone is notified.
let world
let seq = 0
beforeAll(() => {
  world = createWorld('2026-03-10T15:00:00Z') // Tuesday 11:00 in New York (EDT, UTC-4)
})

const at = (iso) => setClock(world, iso)
const person = (timeZone = 'America/New_York') => createPerson(world, `cal-${(seq += 1)}@example.com`, timeZone)
const exportFor = async (p, { days = 14, ...options } = {}) => {
  const plan = await p.service.getCalendarPlan({ days })
  const built = buildPlanCalendar({ plan, options, now: Date.parse(world.clockIso) })
  return { plan, ...built, ...parseIcs(built.text) }
}
const summaries = (file) => file.events.map((e) => `${e.summary} ${e.allDay ? e.start : e.start.slice(0, 16)}`)
const walk = { title: 'Walk', recurrence: 'daily', startsOn: '2026-03-01', plannedStart: '09:00', estimatedMinutes: 20 }
const gym = { title: 'Gym', recurrence: 'weekly', weekdays: [2, 4], startsOn: '2026-03-01', plannedStart: '18:00', plannedEnd: '19:00' }

describe('a realistic week, through the real service', () => {
  it('exports the plan as it really is: repeating tasks day by day, a moved task where it went, a set-aside task not at all', async () => {
    at('2026-03-10T15:00:00Z')
    const p = await person()
    await p.service.createTemplate(walk)
    await p.service.createTemplate(gym)
    await p.service.createTemplate({ title: 'Dentist', recurrence: 'once', startsOn: '2026-03-12', plannedStart: '14:30' })
    await p.service.createTemplate({ title: 'Water plants', recurrence: 'daily', startsOn: '2026-03-01' }) // no time
    const today = await p.service.openDay('2026-03-10')
    const byTitle = (title) => today.occurrences.find((o) => o.title === title)
    await p.service.setAside(byTitle('Walk').id, 'busy_day') // not part of today's plan any more
    await p.service.rescheduleOccurrence(byTitle('Gym').id, '2026-03-11') // moved to Wednesday: not on Tuesday, on Wednesday

    const file = await exportFor(p, { days: 5 })
    expect(summaries(file)).toEqual([
      'Walk 2026-03-11T13:00', // Wednesday 09:00 EDT
      'Gym 2026-03-11T22:00', // the MOVED Gym, at its own time, on its new day
      'Walk 2026-03-12T13:00',
      'Dentist 2026-03-12T18:30', // a one-off, 14:30 EDT
      'Gym 2026-03-12T22:00', // Thursday's repeating Gym
      'Walk 2026-03-13T13:00',
      'Walk 2026-03-14T13:00',
    ])
    expect(file.events.find((e) => e.summary === 'Gym').end).toBe('2026-03-11T23:00:00.000Z') // 19:00 EDT
    expect(file.events.find((e) => e.summary === 'Walk').end).toBe('2026-03-11T13:20:00.000Z') // the estimate
    expect(file.untimedLeftOut).toBe(5) // Water plants, each of the five days, offered separately below
    expect(file.events.every((e) => e.alarms.length === 0)).toBe(true) // nothing is promised: no alerts unless asked
  })

  it('writes the untimed task as an all-day event on each local day when asked', async () => {
    at('2026-03-10T15:00:00Z')
    const p = await person()
    await p.service.createTemplate({ title: 'Water plants', recurrence: 'daily', startsOn: '2026-03-01' })
    const file = await exportFor(p, { days: 3, includeUntimed: true })
    expect(file.events.map((e) => [e.summary, e.start, e.end, e.allDay])).toEqual([
      ['Water plants', '2026-03-10', '2026-03-11', true],
      ['Water plants', '2026-03-11', '2026-03-12', true],
      ['Water plants', '2026-03-12', '2026-03-13', true],
    ])
  })

  it('exporting changes nothing: it creates no day, no task and no reminder', async () => {
    at('2026-03-10T15:00:00Z')
    const p = await person()
    await p.service.createTemplate(walk)
    const before = [await countRows(world, p.userId, 'day-plans'), await countRows(world, p.userId, 'task-occurrences')]
    await exportFor(p, { days: 30, includeUntimed: true, alertMinutes: 10 })
    expect([await countRows(world, p.userId, 'day-plans'), await countRows(world, p.userId, 'task-occurrences')]).toEqual(before)
  })

  it('shows only the signed-in person’s own tasks', async () => {
    at('2026-03-10T15:00:00Z')
    const alice = await person()
    const bob = await person()
    await alice.service.createTemplate({ ...walk, title: 'Alice private' })
    expect((await exportFor(alice, { days: 2 })).events.map((e) => e.summary)).toEqual(['Alice private', 'Alice private'])
    expect((await exportFor(bob, { days: 2 })).events).toEqual([])
  })

  it('refuses a number of days outside 1 to 30 with a calm message', async () => {
    const p = await person()
    for (const days of [0, 31, 100]) await expect(p.service.getCalendarPlan({ days })).rejects.toMatchObject({ code: 'VALIDATION', message: 'Choose between 1 and 30 days.' })
  })
})

describe('which day it is, in the person’s timezone', () => {
  it('the plan starts on the local date: one second before local midnight it is still yesterday', async () => {
    const p = await person('America/New_York')
    await p.service.createTemplate({ ...walk, startsOn: '2026-03-01' })
    at('2026-03-10T03:59:59Z') // 23:59:59 on the 9th in New York
    expect((await exportFor(p, { days: 2 })).plan).toMatchObject({ from: '2026-03-09', to: '2026-03-10' })
    at('2026-03-10T04:00:00Z') // 00:00:00 on the 10th
    const file = await exportFor(p, { days: 2 })
    expect(file.plan.from).toBe('2026-03-10')
    expect(summaries(file)).toEqual(['Walk 2026-03-10T13:00', 'Walk 2026-03-11T13:00'])
  })

  it('a weekly Monday task is on a different Monday for people whose "today" differs at the same instant', async () => {
    const newYork = await person('America/New_York')
    const auckland = await person('Pacific/Auckland')
    const monday = { title: 'Review', recurrence: 'weekly', weekdays: [1], startsOn: '2026-03-01', plannedStart: '07:00' }
    await newYork.service.createTemplate(monday)
    await auckland.service.createTemplate(monday)
    at('2026-03-10T15:00:00Z') // Tuesday 11:00 in New York, Wednesday 04:00 in Auckland
    expect(summaries(await exportFor(newYork, { days: 14 }))).toEqual(['Review 2026-03-16T11:00', 'Review 2026-03-23T11:00']) // 07:00 EDT
    expect(summaries(await exportFor(auckland, { days: 14 }))).toEqual(['Review 2026-03-15T18:00', 'Review 2026-03-22T18:00']) // 07:00 NZDT (UTC+13) = 18:00Z the day before
  })

  it('a person across the date line gets today’s early-morning task on their own local today', async () => {
    const p = await person('Pacific/Kiritimati') // UTC+14
    await p.service.createTemplate({ title: 'Dawn swim', recurrence: 'daily', startsOn: '2026-03-01', plannedStart: '00:30' })
    at('2026-03-10T12:00:00Z') // 02:00 on the 11th there
    const file = await exportFor(p, { days: 2 })
    expect(file.plan.from).toBe('2026-03-11')
    expect(summaries(file)).toEqual(['Dawn swim 2026-03-10T10:30', 'Dawn swim 2026-03-11T10:30']) // 00:30 on the 11th and 12th, as UTC
  })
})

describe('daylight saving through the real service', () => {
  it('a daily 09:00 task is 14:00Z until New York changes its clocks and 13:00Z after', async () => {
    const p = await person('America/New_York')
    await p.service.createTemplate({ ...walk, startsOn: '2026-03-01' })
    at('2026-03-06T17:00:00Z') // Friday 12:00 EST
    const file = await exportFor(p, { days: 5 })
    expect(file.events.map((e) => e.start)).toEqual(['2026-03-06T14:00:00.000Z', '2026-03-07T14:00:00.000Z', '2026-03-08T13:00:00.000Z', '2026-03-09T13:00:00.000Z', '2026-03-10T13:00:00.000Z'])
  })

  it('and the other way in November', async () => {
    const p = await person('America/New_York')
    await p.service.createTemplate({ ...walk, startsOn: '2026-10-01' })
    at('2026-10-31T16:00:00Z') // Saturday 12:00 EDT
    const file = await exportFor(p, { days: 3 })
    expect(file.events.map((e) => e.start)).toEqual(['2026-10-31T13:00:00.000Z', '2026-11-01T14:00:00.000Z', '2026-11-02T14:00:00.000Z'])
  })

  it('a task in the hour a clock change skips is placed after it, and one in the repeated hour at the later time', async () => {
    at('2026-03-08T12:00:00Z') // the clock first: a task can only be planned for dates near "today"
    const p = await person('America/New_York')
    await p.service.createTemplate({ title: 'Skipped hour', recurrence: 'once', startsOn: '2026-03-08', plannedStart: '02:30' })
    expect(summaries(await exportFor(p, { days: 1 }))).toEqual(['Skipped hour 2026-03-08T07:30']) // 03:30 EDT
    at('2026-11-01T12:00:00Z')
    const q = await person('America/New_York')
    await q.service.createTemplate({ title: 'Twice', recurrence: 'once', startsOn: '2026-11-01', plannedStart: '01:30' })
    expect(summaries(await exportFor(q, { days: 1 }))).toEqual(['Twice 2026-11-01T06:30']) // 01:30 EST, the later one
  })
})
