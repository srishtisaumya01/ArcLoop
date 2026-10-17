import { describe, expect, it } from 'vitest'
import { createPlannerService } from '../../../src/services/planner/createPlannerService.js'
import { SERVICE_ERROR } from '../../../src/services/planner/errors.js'
import { WRITABLE } from '../../../src/services/planner/mappers.js'
import { createFakeClient } from '../../support/fakeClient.js'
import { createMemoryDb, dayRow, occRow, tplRow, uuid } from '../../support/memoryDb.js'

// MOCKED tests: a fake Supabase client and an in-memory mock database. They prove the service's
// behaviour around the answers it receives (validation, error mapping, ordering, no false
// success). They do NOT prove RLS or schema behaviour; that is tests/db/plannerService.integration.test.js
// (PGlite) and, for the policies themselves, tests/db/planner.rls.test.js.

const NOW = '2026-03-10T15:00:00Z' // Tuesday 11:00 in New York; today = 2026-03-10
const TODAY = '2026-03-10'
const OID = '22222222-2222-4222-8222-222222222222'
const TID = '44444444-4444-4444-8444-444444444444'
const BASELINE = '2026-03-10T09:00:00+00:00'

const serviceFor = (client, now = NOW) => createPlannerService({ getClient: () => client, clock: () => Date.parse(now) })
const rejection = async (promise) => {
  try {
    await promise
  } catch (e) {
    return e
  }
  throw new Error('expected the call to be rejected')
}
const setup = (data = {}, extra = {}) => {
  const mem = createMemoryDb(data)
  const client = createFakeClient({ handler: mem.handler, ...extra })
  return { mem, client, service: serviceFor(client) }
}
const writesOf = (client) => client.calls.filter((c) => c.op !== 'select')

// One valid call per public method, so no method can be added without being covered below.
const CALLS = {
  getToday: [],
  getDayPlan: [TODAY],
  openDay: [TODAY],
  listTemplates: [],
  createTemplate: [{ title: 'x', recurrence: 'daily', startsOn: TODAY }],
  createTask: [TODAY, { title: 'x' }],
  updateTemplate: [TID, { title: 'y' }],
  archiveTemplate: [TID],
  deleteTemplate: [TID],
  updateOccurrence: [OID, { title: 'y' }],
  setCompletion: [OID, 1],
  undoCompletion: [OID],
  setAside: [OID, 'busy_day'],
  restore: [OID],
  removeOccurrence: [OID],
  rescheduleOccurrence: [OID, '2026-03-12'],
  undoReschedule: [OID],
  setDayMode: [TODAY, 'busy'],
  getPlanSnapshot: [TODAY],
  listSnapshots: [{ from: '2026-03-01', to: TODAY }],
  getWeekSummary: [{}],
  getHabitProgress: [{}],
  getRecoveryStatus: [],
}

describe('coverage guard', () => {
  it('has a call defined for every public service method', () => {
    expect(Object.keys(CALLS).sort()).toEqual(Object.keys(serviceFor(createFakeClient())).sort())
  })
})

describe('configuration and authentication', () => {
  it.each(Object.entries(CALLS))('%s fails with NOT_CONFIGURED when Supabase is not configured', async (name, args) => {
    const service = createPlannerService({ getClient: () => null })
    const e = await rejection(service[name](...args))
    expect(e.code).toBe(SERVICE_ERROR.NOT_CONFIGURED)
  })

  it.each(Object.entries(CALLS))('%s fails with AUTH_REQUIRED when nobody is signed in, without touching the database', async (name, args) => {
    const client = createFakeClient({ signedOut: true })
    const e = await rejection(serviceFor(client)[name](...args))
    expect(e.code).toBe(SERVICE_ERROR.AUTH_REQUIRED)
    expect(client.calls).toEqual([])
  })

  it('maps a session lookup failure (network) to NETWORK and retryable', async () => {
    const client = createFakeClient({ sessionError: { name: 'AuthRetryableFetchError', message: 'fetch failed' } })
    const e = await rejection(serviceFor(client).getToday())
    expect(e).toMatchObject({ code: SERVICE_ERROR.NETWORK, retryable: true })
  })

  it('fails with NOT_FOUND when the profile (and so the timezone) cannot be read', async () => {
    const client = createFakeClient({ profileMissing: true })
    const e = await rejection(serviceFor(client).getToday())
    expect(e.code).toBe(SERVICE_ERROR.NOT_FOUND)
    expect(client.calls.every((c) => c.op === 'select')).toBe(true)
  })

  it('maps a failure while reading the profile', async () => {
    const client = createFakeClient({ handler: (s) => (s.table === 'profiles' ? { error: { code: '42501', message: 'denied' } } : undefined) })
    expect((await rejection(serviceFor(client).getToday())).code).toBe(SERVICE_ERROR.PERMISSION_DENIED)
  })
})

describe('local dates use the profile timezone and the injected clock', () => {
  const today = async (now, timeZone) => (await serviceFor(createFakeClient({ timeZone }), now).getToday()).today

  it('flips exactly at local midnight, either side of a daylight-saving change', async () => {
    expect(await today('2026-03-11T03:59:59Z', 'America/New_York')).toBe('2026-03-10')
    expect(await today('2026-03-11T04:00:00Z', 'America/New_York')).toBe('2026-03-11')
    expect(await today('2026-11-02T04:59:59Z', 'America/New_York')).toBe('2026-11-01')
    expect(await today('2026-11-02T05:00:00Z', 'America/New_York')).toBe('2026-11-02')
  })

  it('differs by user timezone at the same instant', async () => {
    expect(await today('2026-03-10T20:00:00Z', 'America/New_York')).toBe('2026-03-10')
    expect(await today('2026-03-10T20:00:00Z', 'Asia/Kolkata')).toBe('2026-03-11')
    expect(await today('2026-03-10T20:00:00Z', 'Pacific/Kiritimati')).toBe('2026-03-11')
  })

  it('returns the timezone it used', async () => {
    expect((await serviceFor(createFakeClient({ timeZone: 'Asia/Tokyo' })).getToday()).timeZone).toBe('Asia/Tokyo')
  })
})

describe('input is validated before any write', () => {
  const noWrites = (client) => expect(writesOf(client)).toEqual([])

  it.each(['updateTemplate', 'archiveTemplate', 'deleteTemplate', 'updateOccurrence', 'setCompletion', 'undoCompletion', 'setAside', 'restore', 'removeOccurrence', 'rescheduleOccurrence', 'undoReschedule'])(
    '%s rejects a malformed id before touching the database',
    async (name) => {
      const client = createFakeClient()
      const args = [...CALLS[name]]
      args[0] = 'not-a-uuid'
      const e = await rejection(serviceFor(client)[name](...args))
      expect(e.code).toBe(SERVICE_ERROR.VALIDATION)
      expect(client.calls).toEqual([])
    },
  )

  it('rejects impossible dates', async () => {
    for (const [name, args] of [['getDayPlan', ['2026-02-30']], ['getPlanSnapshot', ['nope']], ['openDay', ['2026-13-01']], ['setDayMode', ['2026-02-30', 'busy']]]) {
      const client = createFakeClient()
      const e = await rejection(serviceFor(client)[name](...args))
      expect(e.code, name).toBe(SERVICE_ERROR.VALIDATION)
      noWrites(client)
    }
  })

  it('createTemplate returns field-level errors and writes nothing', async () => {
    const { client, service } = setup()
    const e = await rejection(service.createTemplate({ title: '', recurrence: 'weekly', weekdays: [], startsOn: 'x', estimatedMinutes: 0 }))
    expect(e.code).toBe(SERVICE_ERROR.VALIDATION)
    expect(Object.keys(e.details.fields).sort()).toEqual(['estimatedMinutes', 'startsOn', 'title', 'weekdays'])
    noWrites(client)
  })

  it('createTemplate refuses a one-time task on a day that is already history', async () => {
    const { client, service } = setup()
    const e = await rejection(service.createTemplate({ title: 'x', recurrence: 'once', startsOn: '2026-03-03' }))
    expect(e.details.fields.startsOn).toMatch(/history/i)
    noWrites(client)
  })

  it('createTask refuses read-only and too-distant days', async () => {
    for (const date of ['2026-03-03', '2026-04-10']) {
      const { client, service } = setup()
      expect((await rejection(service.createTask(date, { title: 'x' }))).code).toBe(SERVICE_ERROR.VALIDATION)
      noWrites(client)
    }
  })

  it('openDay refuses read-only days and never creates them (no backfill)', async () => {
    const { client, service } = setup()
    const e = await rejection(service.openDay('2026-03-03'))
    expect(e.code).toBe(SERVICE_ERROR.VALIDATION)
    expect(e.details.plannerCode).toBe('DATE_NOT_EDITABLE')
    noWrites(client)
  })

  it('setCompletion rejects values other than 0, 0.5 and 1 without writing', async () => {
    for (const bad of [0.25, 0.75, 2, -1, '1', null, NaN]) {
      const o = occRow({ id: OID })
      const { client, service } = setup({ occurrences: [o], days: [dayRow()] })
      const e = await rejection(service.setCompletion(OID, bad))
      expect(e.code, String(bad)).toBe(SERVICE_ERROR.VALIDATION)
      expect(e.details.plannerCode).toBe('INVALID_COMPLETION')
      noWrites(client)
    }
  })

  it('setCompletion refuses a future date and a read-only day', async () => {
    for (const planDate of ['2026-03-11', '2026-03-03']) {
      const { client, service } = setup({ occurrences: [occRow({ id: OID, plan_date: planDate })], days: [dayRow({ plan_date: planDate })] })
      expect((await rejection(service.setCompletion(OID, 1))).code).toBe(SERVICE_ERROR.VALIDATION)
      noWrites(client)
    }
  })

  it('setAside, setDayMode, listSnapshots and getWeekSummary validate their arguments', async () => {
    const a = setup({ occurrences: [occRow({ id: OID })], days: [dayRow()] })
    expect((await rejection(a.service.setAside(OID, 'rescheduled'))).code).toBe(SERVICE_ERROR.VALIDATION)
    expect((await rejection(a.service.setAside(OID, undefined))).code).toBe(SERVICE_ERROR.VALIDATION)
    noWrites(a.client)
    const b = setup({ days: [dayRow()] })
    expect((await rejection(b.service.setDayMode(TODAY, 'festival'))).code).toBe(SERVICE_ERROR.VALIDATION)
    expect((await rejection(b.service.listSnapshots({ from: '2026-03-10', to: '2026-03-01' }))).code).toBe(SERVICE_ERROR.VALIDATION)
    expect((await rejection(b.service.listSnapshots({ from: '2026-01-01', to: '2026-03-10' }))).code).toBe(SERVICE_ERROR.VALIDATION)
    expect((await rejection(b.service.listSnapshots({ from: 'x', to: '2026-03-10' }))).code).toBe(SERVICE_ERROR.VALIDATION)
    expect((await rejection(b.service.getWeekSummary({ weekOf: 'soon' }))).code).toBe(SERVICE_ERROR.VALIDATION)
    noWrites(b.client)
  })

  it('updateOccurrence validates the merged details and writes nothing when invalid', async () => {
    const { client, service } = setup({ occurrences: [occRow({ id: OID })], days: [dayRow()] })
    const e = await rejection(service.updateOccurrence(OID, { plannedStart: '10:00', plannedEnd: '09:00', estimatedMinutes: 0 }))
    expect(e.code).toBe(SERVICE_ERROR.VALIDATION)
    expect(Object.keys(e.details.fields).sort()).toEqual(['estimatedMinutes', 'plannedEnd'])
    noWrites(client)
  })

  it('rescheduling to the same day or a read-only day is rejected before any write', async () => {
    const o = occRow({ id: OID })
    for (const target of [TODAY, '2026-03-03', '2026-04-10']) {
      const { client, service } = setup({ occurrences: [o], days: [dayRow()] })
      expect((await rejection(service.rescheduleOccurrence(OID, target))).code).toBe(SERVICE_ERROR.VALIDATION)
      noWrites(client)
    }
  })
})

describe('reads', () => {
  it('maps rows to domain objects (HH:MM times, numeric completion) and includes the summary', async () => {
    const tpl = tplRow()
    const { service } = setup({
      templates: [tpl],
      days: [dayRow({ day_mode: 'busy', baseline_at: BASELINE })],
      occurrences: [
        occRow({ title: 'Gym', planned_start: '17:00:00', completion: '1', completed_at: BASELINE }),
        occRow({ title: 'Read', planned_start: '07:30:00', completion: 0.5, completed_at: BASELINE }),
        occRow({ title: 'Later', planned_start: null, plan_state: 'excluded', excluded_reason: 'busy_day', excluded_at: BASELINE }),
      ],
    })
    const plan = await service.getDayPlan(TODAY)
    expect(plan.exists).toBe(true)
    expect(plan.access).toBe('today')
    expect(plan.occurrences.map((o) => o.title)).toEqual(['Read', 'Gym', 'Later']) // chronological, untimed last
    expect(plan.occurrences[0]).toMatchObject({ plannedStart: '07:30', completion: 0.5 })
    expect(plan.summary).toMatchObject({ kind: 'planned', revised: true, isRestDay: false })
    expect(plan.summary.current).toMatchObject({ count: 2, units: 1.5, percent: 75 })
    expect(plan.summary.original).toMatchObject({ count: 3, units: 1.5, percent: 50 })
  })

  it('an unplanned day is an empty plan, not an error and not a write', async () => {
    const { client, service } = setup()
    expect(await service.getDayPlan(TODAY)).toMatchObject({ exists: false, day: null, occurrences: [], summary: null })
    expect(writesOf(client)).toEqual([])
  })

  it('classifies read-only history, the editable past, today and the future', async () => {
    const { service } = setup()
    const access = async (d) => (await service.getDayPlan(d)).access
    expect(await access('2026-03-03')).toBe('read_only_past')
    expect(await access('2026-03-04')).toBe('editable_past')
    expect(await access(TODAY)).toBe('today')
    expect(await access('2026-03-11')).toBe('future')
    expect(await access('2026-04-10')).toBe('beyond_plan_ahead')
  })

  it('getPlanSnapshot returns null for an unplanned day and a deep-frozen view otherwise', async () => {
    const { service } = setup({ days: [dayRow({ baseline_at: BASELINE })], occurrences: [occRow({ title: 'A' })] })
    expect(await service.getPlanSnapshot('2026-03-09')).toBeNull()
    const snap = await service.getPlanSnapshot(TODAY)
    expect(Object.isFrozen(snap)).toBe(true)
    expect(Object.isFrozen(snap.original[0])).toBe(true)
    expect(snap.original.map((o) => o.title)).toEqual(['A'])
  })

  it('listTemplates hides archived templates unless asked', async () => {
    const { client, service } = setup({ templates: [tplRow({ title: 'live' }), tplRow({ title: 'old', archived_at: BASELINE })] })
    expect((await service.listTemplates()).map((t) => t.title)).toEqual(['live'])
    expect((await service.listTemplates({ includeArchived: true })).map((t) => t.title).sort()).toEqual(['live', 'old'])
    expect(client.calls.some((c) => c.filters.some((f) => f.column === 'archived_at' && f.op === 'is'))).toBe(true)
  })

  it('getWeekSummary uses a Monday-to-Sunday range and the pure weekly rules', async () => {
    const { client, service } = setup({
      days: [dayRow({ plan_date: '2026-03-09' }), dayRow({ plan_date: '2026-03-10' }), dayRow({ plan_date: '2026-03-02' })],
      occurrences: [occRow({ plan_date: '2026-03-09', completion: 1 }), occRow({ plan_date: '2026-03-10', completion: 0 }), occRow({ plan_date: '2026-03-02', completion: 1 })],
    })
    const week = await service.getWeekSummary()
    expect([week.weekStart, week.weekEnd]).toEqual(['2026-03-09', '2026-03-15'])
    expect(week).toMatchObject({ plannedDays: 2, daysWithProgress: 1, averagePercent: 50, eligible: false })
    const range = client.calls.filter((c) => c.table === 'day_plans').flatMap((c) => c.filters).map((f) => `${f.op}:${f.value}`)
    expect(range).toEqual(expect.arrayContaining(['gte:2026-03-09', 'lte:2026-03-15']))
  })

  it('getHabitProgress reads only the requested period up to today and summarises with the pure rules', async () => {
    const templateId = uuid()
    const { client, service } = setup({
      templates: [tplRow({ id: templateId, title: 'Walk' })],
      days: [dayRow({ plan_date: '2026-03-09' }), dayRow({ plan_date: '2026-03-10', day_mode: 'rest' })],
      occurrences: [
        occRow({ template_id: templateId, plan_date: '2026-03-09', completion: 1 }),
        occRow({ template_id: templateId, plan_date: '2026-03-10', completion: 0 }), // a rest day: not counted
        occRow({ template_id: templateId, plan_date: '2026-02-20', completion: 1 }), // before the period
      ],
    })
    const result = await service.getHabitProgress({ days: 7 })
    expect(result).toMatchObject({ from: '2026-03-04', to: '2026-03-10', days: 7 })
    expect(result.habits).toEqual([expect.objectContaining({ title: 'Walk', planned: 1, done: 1, percent: 100 })])
    const range = client.calls.filter((c) => c.table === 'task_occurrences').flatMap((c) => c.filters).map((f) => `${f.op}:${f.value}`)
    expect(range).toEqual(expect.arrayContaining(['gte:2026-03-04', 'lte:2026-03-10']))
  })

  it('getRecoveryStatus only reads the recent days and never writes', async () => {
    const { client, service } = setup({ days: [dayRow({ plan_date: '2026-03-09' })], occurrences: [occRow({ plan_date: '2026-03-09', completion: 0 })] })
    expect(await service.getRecoveryStatus()).toEqual({ returning: true, missedDates: ['2026-03-09'], lastPlannedDate: '2026-03-09' })
    expect(client.calls.every((c) => c.op === 'select')).toBe(true)
    const range = client.calls.filter((c) => c.table === 'day_plans').flatMap((c) => c.filters).map((f) => `${f.op}:${f.value}`)
    expect(range).toEqual(expect.arrayContaining(['gte:2026-02-11', 'lte:2026-03-10']))
  })

  it('getRecoveryStatus says nothing when there is no plan to have missed', async () => {
    const { service } = setup()
    expect(await service.getRecoveryStatus()).toEqual({ returning: false, missedDates: [], lastPlannedDate: null })
  })

  it('getDayPlan previews exactly what opening the day would add, from the same rule and read as openDay', async () => {
    const templateId = uuid()
    const { client, service } = setup({ templates: [tplRow({ id: templateId, title: 'Walk', planned_start: '07:00:00' }), tplRow({ title: 'Later', starts_on: '2026-04-01' })] })
    const unopened = await service.getDayPlan('2026-03-12')
    expect(unopened.exists).toBe(false)
    expect(unopened.expected).toEqual([expect.objectContaining({ templateId, title: 'Walk', plannedStart: '07:00', expected: true })])
    expect(client.calls.every((c) => c.op === 'select')).toBe(true) // a preview creates nothing
    const opened = await service.openDay('2026-03-12')
    expect(opened.occurrences.map((o) => o.title)).toEqual(['Walk']) // the action adds the same task
    expect(opened.expected).toEqual([]) // and nothing is left to add
  })

  it('getDayPlan lists a template created after the day record as expected on that day, and never for read-only history', async () => {
    const templateId = uuid()
    const { client, service } = setup({
      templates: [tplRow({ id: templateId, title: 'New habit' })],
      days: [dayRow({ plan_date: '2026-03-12' }), dayRow({ plan_date: '2026-03-01' })],
      occurrences: [occRow({ plan_date: '2026-03-01', template_id: templateId, title: 'Old', completion: 1 })],
    })
    expect((await service.getDayPlan('2026-03-12')).expected.map((t) => t.title)).toEqual(['New habit'])
    const history = await service.getDayPlan('2026-03-01')
    expect(history.access).toBe('read_only_past')
    expect(history.expected).toEqual([]) // history cannot be topped up
    expect(client.calls.filter((c) => c.table === 'task_templates')).toHaveLength(1) // not even read for history
  })

  it('getHabitProgress rejects a period outside 7 to 90 whole days without reading anything', async () => {
    const { client, service } = setup()
    for (const days of [0, 6, 91, 7.5, '30']) {
      expect((await rejection(service.getHabitProgress({ days }))).code).toBe(SERVICE_ERROR.VALIDATION)
    }
    expect(client.calls.filter((c) => c.table === 'task_occurrences')).toEqual([])
  })

  it('getWeekSummary reads the repeating tasks (no writes) so unopened future days show what they will hold', async () => {
    const templateId = uuid()
    const { client, service } = setup({
      templates: [tplRow({ id: templateId, title: 'Walk', estimated_minutes: 30 }), tplRow({ title: 'Later', starts_on: '2026-04-01' })],
      days: [dayRow({ plan_date: '2026-03-11' })],
      occurrences: [occRow({ template_id: templateId, plan_date: '2026-03-11', title: 'Walk', estimated_minutes: 30 })], // already on Wednesday
    })
    const week = await service.getWeekSummary()
    expect(week.days.filter((d) => d.kind === 'upcoming').map((d) => d.plannedCount)).toEqual([1, 1, 1, 1, 1, 1]) // today (unopened) expects it; Wed has it for real; Thu..Sun expect it
    expect(week.upcomingTasks).toBe(5) // after today
    expect(week.upcomingEstimatedMinutes).toBe(150)
    expect(week.tasksRemaining).toBe(1) // today's, not started
    expect(client.calls.some((c) => c.table === 'task_templates' && c.filters.some((f) => f.column === 'starts_on' && f.op === 'lte' && f.value === '2026-03-15'))).toBe(true)
    expect(client.calls.every((c) => c.op === 'select')).toBe(true)
  })

  it('getWeekSummary does not read templates for a week that is entirely in the past', async () => {
    const { client, service } = setup({ templates: [tplRow({ title: 'Walk' })] })
    await service.getWeekSummary({ weekOf: '2026-03-02' })
    expect(client.calls.some((c) => c.table === 'task_templates')).toBe(false)
  })

  it('an empty week has no average and is not eligible', async () => {
    const { service } = setup()
    expect(await service.getWeekSummary()).toMatchObject({ plannedDays: 0, averagePercent: null, eligible: false })
  })

  it('getWeekSummary pages through large results instead of silently truncating', async () => {
    const days = [dayRow({ plan_date: '2026-03-09' })]
    const occurrences = Array.from({ length: 1500 }, (_, i) => occRow({ plan_date: '2026-03-09', title: `T${i}`, completion: 1 }))
    const { client, service } = setup({ days, occurrences })
    const week = await service.getWeekSummary()
    expect(week.days[0].count).toBe(1500)
    expect(client.calls.filter((c) => c.table === 'task_occurrences').length).toBeGreaterThanOrEqual(2)
  })
})

describe('database failures are mapped, never swallowed', () => {
  const failing = (key, error) => setup({ occurrences: [occRow({ id: OID })], days: [dayRow()], templates: [tplRow({ id: TID })], overrides: { [key]: () => ({ error }) } })

  it.each([
    [{ code: '42501', message: 'new row violates row-level security policy for table "task_occurrences"' }, SERVICE_ERROR.PERMISSION_DENIED],
    [{ code: '23505', message: 'duplicate key' }, SERVICE_ERROR.CONFLICT],
    [{ code: '23514', message: 'check constraint "task_occurrences_done_stays_active"' }, SERVICE_ERROR.VALIDATION],
    [{ code: 'XX000', message: 'internal error at host 10.0.0.5' }, SERVICE_ERROR.UNKNOWN],
  ])('a failed completion write (%j) rejects with %s and no database wording', async (dbError, expected) => {
    const { service } = failing('task_occurrences:update', dbError)
    const e = await rejection(service.setCompletion(OID, 1))
    expect(e.code).toBe(expected)
    expect(e.message).not.toMatch(/task_occurrences|10\.0\.0\.5|row-level/)
  })

  it('a thrown network failure becomes a retryable NETWORK error', async () => {
    const { service } = setup({ occurrences: [occRow({ id: OID })], days: [dayRow()], overrides: { 'task_occurrences:update': () => ({ throws: new TypeError('Failed to fetch') }) } })
    const e = await rejection(service.setCompletion(OID, 1))
    expect(e).toMatchObject({ code: SERVICE_ERROR.NETWORK, retryable: true })
  })

  it('a read failure rejects too', async () => {
    const { service } = failing('day_plans:select', { code: '42501', message: 'denied' })
    expect((await rejection(service.getDayPlan(TODAY))).code).toBe(SERVICE_ERROR.PERMISSION_DENIED)
  })

  it('an update that affects no row is NOT_FOUND, not success (hidden by RLS, removed, or read-only)', async () => {
    for (const [name, args, key] of [
      ['setCompletion', [OID, 1], 'task_occurrences:update'],
      ['setAside', [OID, 'busy_day'], 'task_occurrences:update'],
      ['updateOccurrence', [OID, { title: 'y' }], 'task_occurrences:update'],
      ['setDayMode', [TODAY, 'busy'], 'day_plans:update'],
      ['archiveTemplate', [TID], 'task_templates:update'],
      ['updateTemplate', [TID, { title: 'y' }], 'task_templates:update'],
    ]) {
      const { service } = setup({ occurrences: [occRow({ id: OID })], days: [dayRow()], templates: [tplRow({ id: TID })], overrides: { [key]: () => ({ rows: [] }) } })
      const e = await rejection(service[name](...args))
      expect(e.code, name).toBe(SERVICE_ERROR.NOT_FOUND)
    }
  })

  it('a delete that removes nothing is a CONFLICT, not success', async () => {
    const { service } = setup({ occurrences: [occRow({ id: OID })], days: [dayRow()], overrides: { 'task_occurrences:delete': () => ({ rows: [] }) } })
    expect((await rejection(service.removeOccurrence(OID))).code).toBe(SERVICE_ERROR.CONFLICT)
  })

  it('a duplicate template insert is a CONFLICT', async () => {
    const { service } = setup({ overrides: { 'task_templates:insert': () => ({ error: { code: '23505', message: 'dup' } }) } })
    expect((await rejection(service.createTemplate({ title: 'x', recurrence: 'daily', startsOn: TODAY }))).code).toBe(SERVICE_ERROR.CONFLICT)
  })

  it('records another user\'s hidden rows as missing (the database returns nothing)', async () => {
    const { service } = setup({ occurrences: [] }) // RLS would simply return no rows
    for (const [name, args] of [['setCompletion', [OID, 1]], ['setAside', [OID, 'busy_day']], ['restore', [OID]], ['removeOccurrence', [OID]], ['rescheduleOccurrence', [OID, '2026-03-12']], ['undoReschedule', [OID]], ['updateOccurrence', [OID, { title: 'x' }]], ['updateTemplate', [TID, {}]], ['archiveTemplate', [TID]], ['deleteTemplate', [TID]]]) {
      expect((await rejection(service[name](...args))).code, name).toBe(SERVICE_ERROR.NOT_FOUND)
    }
  })
})

describe('writes only touch columns the database allows clients to write', () => {
  const ALLOWED = {
    'task_templates:insert': WRITABLE.templateInsert, 'task_templates:update': WRITABLE.templateUpdate,
    'day_plans:insert': WRITABLE.dayInsert, 'day_plans:update': WRITABLE.dayUpdate,
    'task_occurrences:insert': WRITABLE.occurrenceInsert, 'task_occurrences:update': WRITABLE.occurrenceUpdate,
  }
  const assertHygiene = (client) => {
    for (const w of writesOf(client)) {
      if (w.op === 'delete') continue
      const allowed = ALLOWED[`${w.table}:${w.op}`]
      expect(allowed, `${w.table}:${w.op} is a known write`).toBeTruthy()
      for (const row of Array.isArray(w.payload) ? w.payload : [w.payload]) {
        expect(Object.keys(row).filter((k) => !allowed.includes(k)), `${w.table}:${w.op}`).toEqual([])
      }
    }
  }

  it('across a full day of operations', async () => {
    const template = tplRow({ id: TID, title: 'Report' })
    const a = occRow({ id: OID, template_id: TID, title: 'Report' })
    const b = occRow({ title: 'Other' })
    const { client, service, mem } = setup({ templates: [template], days: [dayRow()], occurrences: [a, b] })
    await service.createTemplate({ title: 'New', recurrence: 'weekly', weekdays: [1, 3], startsOn: TODAY, plannedStart: '09:00', plannedEnd: '10:00', estimatedMinutes: 30, isPriority: true })
    await service.updateTemplate(TID, { title: 'Report v2', plannedStart: '08:00' })
    await service.updateOccurrence(b.id, { title: 'Other v2', estimatedMinutes: 20 })
    await service.setCompletion(OID, 0.5)
    await service.setDayMode(TODAY, 'busy')
    await service.setAside(b.id, 'busy_day')
    await service.restore(b.id)
    await service.rescheduleOccurrence(OID, '2026-03-12')
    await service.archiveTemplate(TID)
    assertHygiene(client)
    expect(writesOf(client).length).toBeGreaterThan(8)
    expect(mem.tables.task_occurrences.some((o) => o.rescheduled_from_id === OID)).toBe(true)
  })

  it('a new occurrence is never created already done or set aside, whatever the draft carries', async () => {
    const { client, service } = setup({ templates: [tplRow()] })
    await service.openDay(TODAY)
    const insert = writesOf(client).find((w) => w.table === 'task_occurrences' && w.op === 'insert')
    for (const forbidden of ['completion', 'plan_state', 'excluded_reason', 'in_original_plan', 'completed_at', 'excluded_at']) {
      expect(insert.payload[0]).not.toHaveProperty(forbidden)
    }
  })
})

describe('openDay: top-up and duplicate prevention', () => {
  it('creates the day and one occurrence per matching template, once', async () => {
    const { client, service, mem } = setup({ templates: [tplRow({ title: 'Daily' }), tplRow({ title: 'Wednesdays', recurrence: 'weekly', weekdays: [3] })] })
    const plan = await service.openDay(TODAY) // a Tuesday
    expect(plan.occurrences.map((o) => o.title)).toEqual(['Daily'])
    expect(mem.tables.day_plans).toHaveLength(1)
    const again = await service.openDay(TODAY)
    expect(again.occurrences).toHaveLength(1)
    expect(writesOf(client).filter((w) => w.table === 'task_occurrences')).toHaveLength(1) // the second open wrote nothing
  })

  it('does not recreate a template on the day\'s suppression list or one already present', async () => {
    const t1 = tplRow({ title: 'Suppressed' })
    const t2 = tplRow({ title: 'Present' })
    const t3 = tplRow({ title: 'Fresh' })
    const { service } = setup({ templates: [t1, t2, t3], days: [dayRow({ suppressed_template_ids: [t1.id] })], occurrences: [occRow({ template_id: t2.id, title: 'Present' })] })
    const plan = await service.openDay(TODAY)
    expect(plan.occurrences.map((o) => o.title).sort()).toEqual(['Fresh', 'Present'])
  })

  it('respects template start and end dates', async () => {
    const { service } = setup({ templates: [tplRow({ title: 'Later', starts_on: '2026-03-11' }), tplRow({ title: 'Ended', ends_on: '2026-03-09' }), tplRow({ title: 'Live' })] })
    expect((await service.openDay(TODAY)).occurrences.map((o) => o.title)).toEqual(['Live'])
  })

  it('survives a race: when another tab inserted first (duplicate error) it re-reads and finishes without a second insert', async () => {
    const t = tplRow({ title: 'Raced' })
    let selects = 0
    let inserts = 0
    const { service, mem } = setup({
      templates: [t],
      overrides: {
        'task_occurrences:select': (state, tables) => {
          if (state.filters.some((f) => f.column === 'plan_date')) {
            selects += 1
            if (selects === 2) tables.task_occurrences.push(occRow({ template_id: t.id, title: 'Raced' })) // the other tab's row appears after our first read
          }
          return undefined
        },
        'task_occurrences:insert': () => {
          inserts += 1
          return { error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
        },
      },
    })
    // First attempt: reads (none), inserts (duplicate error). Second attempt: re-reads, finds the row, nothing left to insert.
    mem.tables.task_occurrences.length = 0
    const plan = await service.openDay(TODAY)
    expect(inserts).toBe(1)
    expect(plan.occurrences.filter((o) => o.templateId === t.id)).toHaveLength(1)
  })

  it('a persistent duplicate error is a CONFLICT after one retry, not an endless loop', async () => {
    let inserts = 0
    const { service } = setup({
      templates: [tplRow()],
      overrides: { 'task_occurrences:insert': () => { inserts += 1; return { error: { code: '23505', message: 'dup' } } } },
    })
    expect((await rejection(service.openDay(TODAY))).code).toBe(SERVICE_ERROR.CONFLICT)
    expect(inserts).toBe(2)
  })

  it('a concurrent day creation is tolerated', async () => {
    let first = true
    const { service } = setup({
      overrides: {
        'day_plans:insert': (state, tables) => {
          if (first) {
            first = false
            tables.day_plans.push(dayRow())
            return { error: { code: '23505', message: 'day_plans_pkey' } }
          }
          return undefined
        },
      },
    })
    expect((await service.openDay(TODAY)).exists).toBe(true)
  })
})

describe('createTask and templates', () => {
  it('createTask creates a one-time template for that date and its occurrence', async () => {
    const { service, mem } = setup()
    const { template, plan } = await service.createTask(TODAY, { title: 'Dentist', plannedStart: '15:00', estimatedMinutes: 45 })
    expect(template).toMatchObject({ recurrence: 'once', startsOn: TODAY, endsOn: TODAY, plannedStart: '15:00' })
    expect(plan.occurrences.map((o) => o.title)).toEqual(['Dentist'])
    expect(mem.tables.task_templates).toHaveLength(1)
  })

  it('createTask reports a partial failure precisely when the occurrence step fails', async () => {
    const { service } = setup({ overrides: { 'task_occurrences:insert': () => ({ error: { code: 'XX000', message: 'boom' } }) } })
    const e = await rejection(service.createTask(TODAY, { title: 'Dentist' }))
    expect(e.details).toMatchObject({ partial: 'template_created' })
    expect(e.details.templateId).toBeTruthy()
  })

  it('updateTemplate updates only upcoming, untouched occurrences and reports the rest', async () => {
    const tpl = tplRow({ id: TID, title: 'Walk' })
    const future = occRow({ template_id: TID, plan_date: '2026-03-12', title: 'Walk' })
    const today = occRow({ template_id: TID, plan_date: TODAY, title: 'Walk' })
    const progress = occRow({ template_id: TID, plan_date: '2026-03-13', title: 'Walk', completion: 0.5, completed_at: BASELINE })
    const custom = occRow({ template_id: TID, plan_date: '2026-03-14', title: 'Walk', is_customized: true })
    const { service, mem } = setup({ templates: [tpl], days: [dayRow({ plan_date: '2026-03-12' })], occurrences: [future, today, progress, custom] })
    const result = await service.updateTemplate(TID, { title: 'Brisk walk' })
    expect(result.template.title).toBe('Brisk walk')
    expect(result.updatedOccurrenceIds.sort()).toEqual([future.id, today.id].sort())
    expect(result.skipped.map((s) => s.reason).sort()).toEqual(['customized', 'has_progress'])
    const titles = Object.fromEntries(mem.tables.task_occurrences.map((o) => [o.id, o.title]))
    expect(titles[progress.id]).toBe('Walk')
    expect(titles[custom.id]).toBe('Walk')
    expect(titles[future.id]).toBe('Brisk walk')
  })

  it('updateTemplate never rewrites past occurrences', async () => {
    const tpl = tplRow({ id: TID, title: 'Walk' })
    const past = occRow({ template_id: TID, plan_date: '2026-03-08', title: 'Walk' })
    const { service, mem } = setup({ templates: [tpl], occurrences: [past] })
    await service.updateTemplate(TID, { title: 'Run' })
    expect(mem.tables.task_occurrences[0].title).toBe('Walk')
  })

  it('updateTemplate rejects an invalid edit with field errors and writes nothing', async () => {
    const { client, service } = setup({ templates: [tplRow({ id: TID })] })
    const e = await rejection(service.updateTemplate(TID, { title: '' }))
    expect(e.code).toBe(SERVICE_ERROR.VALIDATION)
    expect(writesOf(client)).toEqual([])
  })

  it('updateTemplate says exactly what was applied when a later occurrence write fails', async () => {
    const tpl = tplRow({ id: TID, title: 'Walk' })
    const a = occRow({ template_id: TID, plan_date: '2026-03-12', title: 'Walk' })
    const b = occRow({ template_id: TID, plan_date: '2026-03-13', title: 'Walk' })
    let calls = 0
    const { service } = setup({ templates: [tpl], occurrences: [a, b], overrides: { 'task_occurrences:update': () => (++calls === 2 ? { error: { code: 'XX000', message: 'x' } } : undefined) } })
    const e = await rejection(service.updateTemplate(TID, { title: 'Run' }))
    expect(e.details).toMatchObject({ partial: 'template_updated' })
    expect(e.details.appliedOccurrenceIds).toHaveLength(1)
    expect(e.details.failedOccurrenceId).toBeTruthy()
  })

  it('archiveTemplate ends the template today and keeps history; a not-yet-started template must be deleted instead', async () => {
    const live = tplRow({ id: TID })
    const { service, mem } = setup({ templates: [live] })
    const archived = await service.archiveTemplate(TID)
    expect(archived).toMatchObject({ endsOn: TODAY })
    expect(archived.archivedAt).toBeTruthy()
    expect(mem.tables.task_templates[0].ends_on).toBe(TODAY)
    expect((await rejection(service.archiveTemplate(TID))).code).toBe(SERVICE_ERROR.CONFLICT)

    const future = tplRow({ id: uuid(), starts_on: '2026-03-20' })
    const b = setup({ templates: [future] })
    expect((await rejection(b.service.archiveTemplate(future.id))).code).toBe(SERVICE_ERROR.VALIDATION)
  })

  it('archiveTemplate keeps an earlier end date', async () => {
    const t = tplRow({ id: TID, ends_on: '2026-03-12' })
    const { service } = setup({ templates: [t] })
    expect((await service.archiveTemplate(TID)).endsOn).toBe(TODAY) // today is earlier than 03-12, so the template ends today
    const past = tplRow({ id: uuid(), ends_on: '2026-03-05' })
    const b = setup({ templates: [past] })
    expect((await b.service.archiveTemplate(past.id)).endsOn).toBe('2026-03-05') // already ended earlier: unchanged
  })

  it('deleteTemplate removes untouched upcoming occurrences, keeps anything with progress, then deletes the template', async () => {
    const tpl = tplRow({ id: TID })
    const pending = occRow({ template_id: TID, plan_date: '2026-03-12' })
    const progress = occRow({ template_id: TID, plan_date: '2026-03-13', completion: 1, completed_at: BASELINE })
    const past = occRow({ template_id: TID, plan_date: '2026-03-08' })
    const { service, mem } = setup({
      templates: [tpl],
      days: [dayRow({ plan_date: '2026-03-12' }), dayRow({ plan_date: '2026-03-13' })],
      occurrences: [pending, progress, past],
    })
    const result = await service.deleteTemplate(TID)
    expect(result).toEqual({ removedUpcoming: 1, keptWithHistory: 1 })
    expect(mem.tables.task_templates).toEqual([])
    expect(mem.tables.task_occurrences.map((o) => o.id).sort()).toEqual([progress.id, past.id].sort())
  })
})

describe('completion, set-aside and removal rules', () => {
  const withOcc = (occ, dayOverrides = {}) => setup({ occurrences: [occRow({ id: OID, ...occ })], days: [dayRow(dayOverrides)] })

  it('records 0.5 and 1, undoes to 0, and writes only completion/state', async () => {
    const { service, mem } = withOcc({})
    expect((await service.setCompletion(OID, 0.5)).occurrence.completion).toBe(0.5)
    expect((await service.setCompletion(OID, 1)).occurrence.completion).toBe(1)
    expect((await service.undoCompletion(OID)).occurrence.completion).toBe(0)
    expect(mem.tables.task_occurrences[0].completion).toBe(0)
  })

  it('setting the value it already has is a no-op with no write (no duplicate credit)', async () => {
    const { client, service } = withOcc({ completion: 1, completed_at: BASELINE }, { baseline_at: BASELINE })
    expect(await service.setCompletion(OID, 1)).toMatchObject({ changed: false })
    expect(writesOf(client)).toEqual([])
  })

  it('raising progress on a set-aside task restores it; a moved task needs the move undone', async () => {
    const a = withOcc({ plan_state: 'excluded', excluded_reason: 'busy_day', excluded_at: BASELINE }, { baseline_at: BASELINE })
    const r = await a.service.setCompletion(OID, 0.5)
    expect(r.restored).toBe(true)
    expect(r.occurrence).toMatchObject({ planState: 'active', excludedReason: null })
    const b = withOcc({ plan_state: 'excluded', excluded_reason: 'rescheduled', excluded_at: BASELINE }, { baseline_at: BASELINE })
    const e = await rejection(b.service.setCompletion(OID, 1))
    expect(e).toMatchObject({ code: SERVICE_ERROR.CONFLICT })
    expect(e.details.plannerCode).toBe('REQUIRES_UNDO_RESCHEDULE')
    expect(writesOf(b.client)).toEqual([])
  })

  it('set-aside: a partially completed task is allowed, a done task is a CONFLICT', async () => {
    const half = withOcc({ completion: 0.5, completed_at: BASELINE }, { baseline_at: BASELINE })
    expect((await half.service.setAside(OID, 'rest_day')).occurrence).toMatchObject({ planState: 'excluded', excludedReason: 'rest_day', completion: 0.5 })
    const done = withOcc({ completion: 1, completed_at: BASELINE }, { baseline_at: BASELINE })
    const e = await rejection(done.service.setAside(OID, 'busy_day'))
    expect(e.code).toBe(SERVICE_ERROR.CONFLICT)
    expect(writesOf(done.client)).toEqual([])
  })

  it('restore: brings a set-aside task back, refuses an active one and a moved one', async () => {
    const a = withOcc({ plan_state: 'excluded', excluded_reason: 'busy_day', excluded_at: BASELINE })
    expect(await a.service.restore(OID)).toMatchObject({ planState: 'active', excludedReason: null })
    expect((await rejection(withOcc({}).service.restore(OID))).details.plannerCode).toBe('NOT_EXCLUDED')
    const moved = withOcc({ plan_state: 'excluded', excluded_reason: 'rescheduled', excluded_at: BASELINE })
    expect((await rejection(moved.service.restore(OID))).details.plannerCode).toBe('REQUIRES_UNDO_RESCHEDULE')
  })

  it('removal before the baseline: suppress the template, then hard-delete (suppression is written first)', async () => {
    const o = occRow({ id: OID, template_id: TID })
    const { client, service, mem } = setup({ occurrences: [o], days: [dayRow()], templates: [tplRow({ id: TID })] })
    expect(await service.removeOccurrence(OID)).toMatchObject({ action: 'delete', deleted: OID })
    const kinds = writesOf(client).map((w) => `${w.table}:${w.op}`)
    expect(kinds).toEqual(['day_plans:update', 'task_occurrences:delete']) // suppression first, then delete
    expect(mem.tables.day_plans[0].suppressed_template_ids).toEqual([TID])
    expect(mem.tables.day_plans[0].baseline_at).toBeNull() // composing the plan is not a revision
  })

  it('if the delete fails the suppression is put back', async () => {
    const o = occRow({ id: OID, template_id: TID })
    const { service, mem } = setup({
      occurrences: [o], days: [dayRow()],
      overrides: { 'task_occurrences:delete': () => ({ error: { code: 'XX000', message: 'x' } }) },
    })
    expect((await rejection(service.removeOccurrence(OID))).code).toBe(SERVICE_ERROR.UNKNOWN)
    expect(mem.tables.day_plans[0].suppressed_template_ids).toEqual([])
  })

  it('removal after the baseline soft-removes an original-plan task and hard-deletes a later addition', async () => {
    const orig = withOcc({ template_id: TID, in_original_plan: true }, { baseline_at: BASELINE })
    expect(await orig.service.removeOccurrence(OID)).toMatchObject({ action: 'exclude' })
    expect(orig.mem.tables.task_occurrences[0]).toMatchObject({ plan_state: 'excluded', excluded_reason: 'removed' })
    const late = withOcc({ template_id: TID, in_original_plan: false }, { baseline_at: BASELINE })
    expect(await late.service.removeOccurrence(OID)).toMatchObject({ action: 'delete' })
    expect(late.mem.tables.task_occurrences).toEqual([])
  })

  it('a done task cannot be removed, and nothing is written', async () => {
    const { client, service } = withOcc({ completion: 1, completed_at: BASELINE }, { baseline_at: BASELINE })
    expect((await rejection(service.removeOccurrence(OID))).code).toBe(SERVICE_ERROR.CONFLICT)
    expect(writesOf(client)).toEqual([])
  })

  it('day modes: switching writes only the mode and returns the day; same mode is a no-op', async () => {
    const { client, service, mem } = setup({ days: [dayRow()] })
    expect((await service.setDayMode(TODAY, 'rest')).dayMode).toBe('rest')
    expect(mem.tables.day_plans[0].day_mode).toBe('rest')
    const before = writesOf(client).length
    await service.setDayMode(TODAY, 'rest')
    expect(writesOf(client).length).toBe(before)
    for (const w of writesOf(client)) expect(Object.keys(w.payload)).toEqual(['day_mode'])
  })

  it('setDayMode creates a missing day first', async () => {
    const { service, mem } = setup()
    await service.setDayMode(TODAY, 'busy')
    expect(mem.tables.day_plans).toHaveLength(1)
    expect(mem.tables.day_plans[0].day_mode).toBe('busy')
  })

  it('updateOccurrence marks the task customised and normalises the details', async () => {
    const { service, mem } = setup({ occurrences: [occRow({ id: OID })], days: [dayRow()] })
    const saved = await service.updateOccurrence(OID, { title: '  Stretch  ', plannedStart: '07:00', estimatedMinutes: '15' })
    expect(saved).toMatchObject({ title: 'Stretch', plannedStart: '07:00', estimatedMinutes: 15, isCustomized: true })
    expect(mem.tables.task_occurrences[0].is_customized).toBe(true)
  })
})

describe('rescheduling', () => {
  const FRIDAY = '2026-03-13'
  const base = (extra = {}) => {
    const source = occRow({ id: OID, template_id: TID, title: 'Report', ...extra })
    return setup({ occurrences: [source], days: [dayRow()], templates: [tplRow({ id: TID })] })
  }

  it('creates a linked occurrence on the target day and sets the source aside as rescheduled', async () => {
    const { service, mem } = base()
    const { source, target, link } = await service.rescheduleOccurrence(OID, FRIDAY)
    expect(source).toMatchObject({ id: OID, planDate: TODAY, planState: 'excluded', excludedReason: 'rescheduled' })
    expect(target).toMatchObject({ planDate: FRIDAY, rescheduledFromId: OID, completion: 0, planState: 'active', title: 'Report' })
    expect(link).toEqual({ fromId: OID, fromDate: TODAY, toDate: FRIDAY, reason: 'rescheduled' })
    expect(mem.tables.day_plans.map((d) => d.plan_date).sort()).toEqual([TODAY, FRIDAY])
  })

  it('a partially completed task can be moved: its 0.5 stays, the remainder is pending (C2)', async () => {
    const { service } = base({ completion: 0.5, completed_at: BASELINE })
    const { source, target } = await service.rescheduleOccurrence(OID, FRIDAY)
    expect(source).toMatchObject({ completion: 0.5, planState: 'excluded' })
    expect(target.completion).toBe(0)
  })

  it('a done task cannot be moved', async () => {
    const { client, service } = base({ completion: 1, completed_at: BASELINE })
    expect((await rejection(service.rescheduleOccurrence(OID, FRIDAY))).code).toBe(SERVICE_ERROR.CONFLICT)
    expect(writesOf(client)).toEqual([])
  })

  it('refuses when the template is already planned on that day', async () => {
    const source = occRow({ id: OID, template_id: TID })
    const existing = occRow({ template_id: TID, plan_date: FRIDAY })
    const { client, service } = setup({ occurrences: [source, existing], days: [dayRow(), dayRow({ plan_date: FRIDAY })], templates: [tplRow({ id: TID })] })
    const e = await rejection(service.rescheduleOccurrence(OID, FRIDAY))
    expect(e.code).toBe(SERVICE_ERROR.CONFLICT)
    expect(e.details.plannerCode).toBe('ALREADY_PLANNED_ON_TARGET')
    expect(writesOf(client)).toEqual([])
  })

  it('removes the template from the target day\'s suppression list when the user asks for it there', async () => {
    const source = occRow({ id: OID, template_id: TID })
    const { service, mem } = setup({ occurrences: [source], days: [dayRow(), dayRow({ plan_date: FRIDAY, suppressed_template_ids: [TID] })], templates: [tplRow({ id: TID })] })
    await service.rescheduleOccurrence(OID, FRIDAY)
    expect(mem.tables.day_plans.find((d) => d.plan_date === FRIDAY).suppressed_template_ids).toEqual([])
  })

  it('writes the target first and the source last, so a failure never loses the task', async () => {
    const { client, service } = base()
    await service.rescheduleOccurrence(OID, FRIDAY)
    const order = writesOf(client).map((w) => `${w.table}:${w.op}`)
    expect(order.indexOf('task_occurrences:insert')).toBeLessThan(order.lastIndexOf('task_occurrences:update'))
  })

  it('if marking the source fails, the new copy is removed again and the error is reported', async () => {
    const { service, mem } = (() => {
      const source = occRow({ id: OID, template_id: TID })
      return setup({ occurrences: [source], days: [dayRow()], templates: [tplRow({ id: TID })], overrides: { 'task_occurrences:update': () => ({ error: { code: 'XX000', message: 'x' } }) } })
    })()
    const e = await rejection(service.rescheduleOccurrence(OID, FRIDAY))
    expect(e.code).toBe(SERVICE_ERROR.UNKNOWN)
    expect(mem.tables.task_occurrences).toHaveLength(1) // only the original; the copy was cleaned up
    expect(mem.tables.task_occurrences[0].id).toBe(OID)
  })

  it('an update that hits no row also triggers the clean-up and reports NOT_FOUND', async () => {
    const source = occRow({ id: OID, template_id: TID })
    const { service, mem } = setup({ occurrences: [source], days: [dayRow()], templates: [tplRow({ id: TID })], overrides: { 'task_occurrences:update': () => ({ rows: [] }) } })
    expect((await rejection(service.rescheduleOccurrence(OID, FRIDAY))).code).toBe(SERVICE_ERROR.NOT_FOUND)
    expect(mem.tables.task_occurrences).toHaveLength(1)
  })

  it('if the clean-up also fails, the caller is told a copy may remain', async () => {
    const source = occRow({ id: OID, template_id: TID })
    const { service } = setup({
      occurrences: [source], days: [dayRow()], templates: [tplRow({ id: TID })],
      overrides: { 'task_occurrences:update': () => ({ error: { code: 'XX000', message: 'x' } }), 'task_occurrences:delete': () => ({ error: { code: 'XX000', message: 'y' } }) },
    })
    const e = await rejection(service.rescheduleOccurrence(OID, FRIDAY))
    expect(e.details.partial).toBe('target_created')
    expect(e.details.targetId).toBeTruthy()
  })

  it('a duplicate on insert (another tab moved it first) is a CONFLICT and leaves the source untouched', async () => {
    const source = occRow({ id: OID, template_id: TID })
    const { service, mem } = setup({ occurrences: [source], days: [dayRow()], templates: [tplRow({ id: TID })], overrides: { 'task_occurrences:insert': () => ({ error: { code: '23505', message: 'dup' } }) } })
    expect((await rejection(service.rescheduleOccurrence(OID, FRIDAY))).code).toBe(SERVICE_ERROR.CONFLICT)
    expect(mem.tables.task_occurrences[0]).toMatchObject({ id: OID, plan_state: 'active' })
  })

  it('undoReschedule removes the copy and restores the source, keeping partial progress', async () => {
    const { service, mem } = base({ completion: 0.5, completed_at: BASELINE })
    await service.rescheduleOccurrence(OID, FRIDAY)
    const undone = await service.undoReschedule(OID)
    expect(undone.source).toMatchObject({ id: OID, planState: 'active', excludedReason: null, completion: 0.5 })
    expect(mem.tables.task_occurrences.map((o) => o.id)).toEqual([OID])
    expect(mem.tables.day_plans.find((d) => d.plan_date === FRIDAY).suppressed_template_ids).toEqual([TID])
  })

  it('undoReschedule refuses when progress was recorded on the new day', async () => {
    const { service, mem } = base()
    await service.rescheduleOccurrence(OID, FRIDAY)
    mem.tables.task_occurrences.find((o) => o.rescheduled_from_id === OID).completion = 0.5
    const e = await rejection(service.undoReschedule(OID))
    expect(e.code).toBe(SERVICE_ERROR.CONFLICT)
    expect(mem.tables.task_occurrences.find((o) => o.id === OID).plan_state).toBe('excluded')
  })

  it('undoReschedule when the copy no longer exists simply restores the source; a task that was never moved is a CONFLICT', async () => {
    const orphan = setup({ occurrences: [occRow({ id: OID, plan_state: 'excluded', excluded_reason: 'rescheduled', excluded_at: BASELINE })], days: [dayRow({ baseline_at: BASELINE })] })
    expect((await orphan.service.undoReschedule(OID)).source).toMatchObject({ planState: 'active', excludedReason: null })
    const never = setup({ occurrences: [occRow({ id: OID })], days: [dayRow()] })
    expect((await rejection(never.service.undoReschedule(OID))).code).toBe(SERVICE_ERROR.CONFLICT)
  })
})
