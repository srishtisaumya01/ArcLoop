import { beforeAll, describe, expect, it } from 'vitest'
import { countRows, createPerson, createWorld, listRows, setClock } from './harness.js'

// The real planner service and the real server, with the clock placed at awkward moments: just either side of local
// midnight, on 23- and 25-hour days, across the date line, after a timezone change. The client decides what to open and
// show; the server decides what it will accept. Both must agree about which date "today" is.
//
// These are chosen cases, not a proof that timezone handling is correct everywhere (see docs/KNOWN_ISSUES.md).
let world
let seq = 0
beforeAll(() => {
  world = createWorld('2026-03-10T15:00:00Z')
})

const at = (iso) => setClock(world, iso)
const person = (timeZone) => createPerson(world, `tzb-${(seq += 1)}@example.com`, timeZone)
const on = (p, date) => listRows(world, p.userId, 'task-occurrences', { plan_date: date })
const daily = (extra = {}) => ({ title: 'Walk', recurrence: 'daily', startsOn: '2026-03-01', ...extra })

describe('local midnight', () => {
  it('opens the new local date exactly at midnight, never earlier and never twice', async () => {
    const p = await person('America/New_York') // UTC-4 on 10 March 2026
    at('2026-03-10T03:59:59Z') // 23:59:59 on the 9th
    await p.service.createTemplate(daily())
    expect((await p.service.getToday()).today).toBe('2026-03-09')
    await p.service.openDay('2026-03-09')
    expect((await on(p, '2026-03-09')).length).toBe(1)
    expect((await on(p, '2026-03-10')).length).toBe(0)
    at('2026-03-10T04:00:00Z') // 00:00:00 on the 10th
    expect((await p.service.getToday()).today).toBe('2026-03-10')
    await p.service.openDay('2026-03-10')
    await p.service.openDay('2026-03-10') // idempotent
    expect((await on(p, '2026-03-10')).length).toBe(1)
    expect((await on(p, '2026-03-09')).length).toBe(1) // yesterday untouched
  })

  it('a task that starts tomorrow is not due until local midnight', async () => {
    const p = await person('America/New_York')
    at('2026-03-10T03:59:59Z') // still the 9th
    await p.service.createTemplate(daily({ startsOn: '2026-03-10' }))
    await p.service.openDay('2026-03-09')
    expect((await on(p, '2026-03-09')).length).toBe(0)
    at('2026-03-10T04:00:00Z')
    await p.service.openDay('2026-03-10')
    expect((await on(p, '2026-03-10')).length).toBe(1)
  })

  it('progress for the new local day is refused by the server until local midnight, and the client agrees', async () => {
    const p = await person('America/New_York')
    at('2026-03-10T03:59:59Z')
    await p.service.createTemplate(daily())
    await p.service.openDay('2026-03-09')
    at('2026-03-10T04:00:00Z')
    const tenth = (await p.service.openDay('2026-03-10')).occurrences[0]
    await expect(p.service.setCompletion(tenth.id, 1)).resolves.toBeTruthy() // today now
    at('2026-03-10T03:59:59Z') // the clock was wrong: back to the 9th; the 10th is the future again
    const refused = await p.service.setCompletion(tenth.id, 0.5).catch((e) => e)
    expect(refused.code).toBe('VALIDATION') // the client refuses before asking
    const direct = await p.client.from('task_occurrences').update({ completion: 0.5 }).eq('id', tenth.id).select('id')
    expect(direct.error?.code).toBe('22008') // and the server independently refuses a future date's progress
  })
})

describe('the editing window moves at local midnight, and client and server agree', () => {
  it('the same date is editable one second before midnight and read-only one second after', async () => {
    const p = await person('America/New_York')
    at('2026-03-11T03:59:59Z') // 23:59:59 on the 10th: the window is 4 to 10 March
    expect((await p.service.openDay('2026-03-04')).exists).toBe(true)
    expect((await p.client.from('day_plans').select('plan_date').eq('plan_date', '2026-03-04')).data.length).toBe(1)
    at('2026-03-11T04:00:00Z') // 00:00:00 on the 11th: the window is 5 to 11 March
    const clientSays = await p.service.setDayMode('2026-03-04', 'rest').catch((e) => e)
    expect(clientSays.code).toBe('VALIDATION')
    const serverSays = await p.client.from('day_plans').update({ day_mode: 'rest' }).eq('plan_date', '2026-03-04').select('plan_date')
    expect(serverSays.data).toEqual([]) // nothing changed: the day is history to the server too
    const created = await p.client.from('day_plans').insert({ user_id: p.userId, plan_date: '2026-03-03' }).select('plan_date')
    expect(created.error?.code).toBe('42501')
  })
})

describe('daylight saving days', () => {
  it('the spring-forward day (23 hours) has exactly one plan and one task, however often it is opened', async () => {
    const p = await person('America/New_York')
    at('2026-03-08T04:59:00Z') // 23:59 on the 7th
    await p.service.createTemplate(daily())
    for (const iso of ['2026-03-08T05:00:00Z', '2026-03-08T06:59:59Z', '2026-03-08T07:00:00Z', '2026-03-08T23:59:59Z']) {
      at(iso) // 00:00 EST, 01:59:59 EST, 03:00 EDT (02:00 never happened), 19:59 EDT: all the 8th
      expect((await p.service.getToday()).today, iso).toBe('2026-03-08')
      await p.service.openDay('2026-03-08')
    }
    expect((await on(p, '2026-03-08')).length).toBe(1)
    expect(await countRows(world, p.userId, 'day-plans', { plan_date: '2026-03-08' })).toBe(1)
    at('2026-03-09T04:00:00Z') // 00:00 EDT on the 9th
    await p.service.openDay('2026-03-09')
    expect((await on(p, '2026-03-09')).length).toBe(1)
    expect(await countRows(world, p.userId, 'task-occurrences')).toBe(2) // 8th and 9th: no date lost, none doubled
  })

  it('the fall-back day (25 hours) stays one date through the repeated hour', async () => {
    const p = await person('America/New_York')
    at('2026-11-01T03:59:00Z') // 23:59 EDT on 31 October
    await p.service.createTemplate(daily({ startsOn: '2026-10-25' }))
    for (const iso of ['2026-11-01T04:00:00Z', '2026-11-01T05:30:00Z', '2026-11-01T06:30:00Z', '2026-11-02T04:59:59Z']) {
      at(iso) // 00:00 EDT, 01:30 EDT (first), 01:30 EST (second), 23:59:59 EST: all 1 November
      expect((await p.service.getToday()).today, iso).toBe('2026-11-01')
      await p.service.openDay('2026-11-01')
    }
    expect((await on(p, '2026-11-01')).length).toBe(1)
    at('2026-11-02T05:00:00Z') // 00:00 EST on the 2nd
    expect((await p.service.getToday()).today).toBe('2026-11-02')
  })

  it('a half-hour DST zone (Lord Howe) moves the date at the right instant in summer and in winter', async () => {
    const p = await person('Australia/Lord_Howe')
    at('2026-03-09T12:59:59Z') // UTC+11: 23:59:59 on the 9th
    expect((await p.service.getToday()).today).toBe('2026-03-09')
    at('2026-03-09T13:00:00Z')
    expect((await p.service.getToday()).today).toBe('2026-03-10')
    at('2026-07-09T13:29:59Z') // UTC+10:30 in winter
    expect((await p.service.getToday()).today).toBe('2026-07-09')
    at('2026-07-09T13:30:00Z')
    expect((await p.service.getToday()).today).toBe('2026-07-10')
  })
})

describe('across the date line', () => {
  it('a weekly Monday task opens for the person whose today is Monday and not for the one whose today is Tuesday', async () => {
    const kiritimati = await person('Pacific/Kiritimati') // UTC+14
    const pagoPago = await person('Pacific/Pago_Pago') // UTC-11
    at('2026-03-09T12:00:00Z') // 12:00 Monday in UTC
    for (const p of [kiritimati, pagoPago]) await p.service.createTemplate({ title: 'Monday review', recurrence: 'weekly', weekdays: [1], startsOn: '2026-03-01' })
    expect((await kiritimati.service.getToday()).today).toBe('2026-03-10') // 02:00 on Tuesday
    expect((await pagoPago.service.getToday()).today).toBe('2026-03-09') // 01:00 on Monday
    await kiritimati.service.openDay('2026-03-10')
    await pagoPago.service.openDay('2026-03-09')
    expect((await on(kiritimati, '2026-03-10')).length).toBe(0) // a Tuesday there
    expect((await on(pagoPago, '2026-03-09')).map((o) => o.title)).toEqual(['Monday review'])
    // The week each sees is their own: both weeks start on a Monday, but a different one.
    expect((await kiritimati.service.getWeekSummary()).weekStart).toBe('2026-03-09')
    expect((await pagoPago.service.getWeekSummary()).weekStart).toBe('2026-03-09')
    at('2026-03-15T12:00:00Z') // Sunday noon UTC: Monday 16th in Kiritimati, still Sunday 15th in Pago Pago
    expect((await kiritimati.service.getWeekSummary()).weekStart).toBe('2026-03-16')
    expect((await pagoPago.service.getWeekSummary()).weekStart).toBe('2026-03-09')
  })
})

describe('changing the timezone', () => {
  it('moves today but never rewrites a recorded day', async () => {
    const p = await person('America/New_York')
    at('2026-03-10T03:00:00Z') // 23:00 on the 9th in New York
    await p.service.createTemplate(daily())
    const day = await p.service.openDay('2026-03-09')
    await p.service.setCompletion(day.occurrences[0].id, 1)
    const before = (await on(p, '2026-03-09'))[0]
    await p.client.from('profiles').update({ timezone: 'Pacific/Auckland' }).eq('id', p.userId).select('id') // 16:00 on the 10th there
    expect((await p.service.getToday()).today).toBe('2026-03-10')
    await p.service.openDay('2026-03-10')
    const after = (await on(p, '2026-03-09'))[0]
    expect({ id: after.id, completion: after.completion, plan_date: after.plan_date, completed_at: after.completed_at }).toEqual({ id: before.id, completion: 1, plan_date: '2026-03-09', completed_at: before.completed_at })
    expect((await on(p, '2026-03-10')).length).toBe(1)
  })
})
