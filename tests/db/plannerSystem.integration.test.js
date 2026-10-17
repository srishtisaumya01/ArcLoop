import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createPlannerService } from '../../src/services/planner/createPlannerService.js'
import { PlannerServiceError, SERVICE_ERROR } from '../../src/services/planner/errors.js'
import { createPgliteClient } from '../support/pgliteSupabase.js'
import { asUser, createDb, createUser, setClock, useFixedClock } from './harness.js'
import { CLOCK, TODAY, count, day, occurrence, one } from './plannerSeed.js'

// SYSTEM-LEVEL integration tests (PGlite): the real pure logic -> the real service -> the real
// migration (constraints, triggers, column grants, RLS), exercised as connected flows and checked
// against ORACLES written independently in this file (not imported from the code under test).
// Scope and limits: PGlite is Postgres, but the adapter is not PostgREST and nothing here talks to a
// real Supabase project. There is no browser or UI in these tests because the planner UI does not exist yet.
let db
let nowIso = CLOCK
let seq = 0

beforeAll(async () => {
  db = await createDb()
  await useFixedClock(db, CLOCK)
}, 60000)
afterAll(async () => {
  await db?.close()
})
const setNow = async (iso) => {
  nowIso = iso
  await setClock(db, iso)
}
afterEach(async () => {
  await setNow(CLOCK)
})

const fresh = (tz = 'America/New_York') => createUser(db, `sys-${(seq += 1)}@example.com`, tz)
// A session whose signed-in user can be switched (or removed) without rebuilding the service.
function session(initialUser) {
  let current = initialUser
  const client = createPgliteClient(db, { getUserId: () => current })
  const service = createPlannerService({ getClient: () => client, clock: () => Date.parse(nowIso) })
  return { service, client, as: (u) => { current = u }, get user() { return current } }
}
const fail = async (promise) => {
  try {
    await promise
  } catch (e) {
    return e
  }
  throw new Error('expected a rejection')
}

// ---- independent oracles -------------------------------------------------------------
const isoWeekday = (d) => new Date(`${d}T00:00:00Z`).getUTCDay() || 7
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
const occursOracle = (t, date) => {
  if (date < t.startsOn || (t.endsOn && date > t.endsOn)) return false
  if (t.recurrence === 'once') return date === t.startsOn
  if (t.recurrence === 'daily') return true
  return t.weekdays.includes(isoWeekday(date))
}
// 100*units/count with half-up rounding, 100 only if everything is done, at least 1 for any progress.
const percentOracle = (units, n) => {
  if (n === 0) return null
  if (units === n) return 100
  let p = Math.floor((100 * units) / n + 0.5 + 1e-9)
  if (p >= 100) p = 99
  if (units > 0 && p < 1) p = 1
  return p
}
const sum = (rows, f = (r) => Number(r.completion)) => rows.reduce((a, r) => a + f(r), 0)

async function rowsOf(userId) {
  const days = (await db.query('select to_char(plan_date, \'YYYY-MM-DD\') as plan_date, day_mode, baseline_at, suppressed_template_ids from public.day_plans where user_id = $1 order by plan_date', [userId])).rows
  const occs = (await db.query(
    `select id, to_char(plan_date, 'YYYY-MM-DD') as plan_date, template_id, title, completion, completed_at, plan_state, excluded_reason, in_original_plan, rescheduled_from_id
       from public.task_occurrences where user_id = $1 order by plan_date, id`, [userId])).rows.map((r) => ({ ...r, completion: Number(r.completion) }))
  return { days, occs }
}
const digest = async (userId, where = 'true') =>
  (await one(db, `select md5(coalesce(string_agg(t::text, '|' order by t.plan_date, t.id), '')) as h from public.task_occurrences t where t.user_id = $1 and ${where}`, [userId])).h

// What My Day would show for one date, recomputed from raw rows.
function dayOracle(dayRow, occs) {
  const active = occs.filter((o) => o.plan_state === 'active')
  const original = occs.filter((o) => o.in_original_plan)
  const revised = dayRow.day_mode !== 'normal' || occs.some((o) => o.plan_state === 'excluded' || !o.in_original_plan)
  const units = sum(active)
  return {
    kind: dayRow.day_mode === 'rest' ? 'rest' : active.length === 0 ? 'empty' : 'planned',
    revised,
    current: { count: active.length, units, percent: percentOracle(units, active.length) },
    original: revised ? { count: original.length, units: sum(original), percent: percentOracle(sum(original), original.length) } : null,
  }
}

// =====================================================================================
describe('persistence and navigation across dates (flows 2, 3, 7, 8)', () => {
  it('data written in one session is exactly what a brand-new session reads (a page refresh)', async () => {
    const u = await fresh()
    const a = session(u)
    const { template } = await a.service.createTask(TODAY, { title: 'Dentist', plannedStart: '15:00', estimatedMinutes: 45 })
    const plan = await a.service.getDayPlan(TODAY)
    const id = plan.occurrences[0].id
    await a.service.updateOccurrence(id, { title: 'Dentist (moved clinic)', estimatedMinutes: 60 })
    await a.service.setCompletion(id, 0.5)

    const b = session(u) // new client, new service: nothing cached
    const reread = await b.service.getDayPlan(TODAY)
    expect(reread.occurrences).toHaveLength(1)
    expect(reread.occurrences[0]).toMatchObject({ id, title: 'Dentist (moved clinic)', estimatedMinutes: 60, plannedStart: '15:00', completion: 0.5, isCustomized: true, templateId: template.id })
    expect(reread.summary.current).toMatchObject({ count: 1, units: 0.5, percent: 50 })
    expect(reread.day.baselineAt).toBeTruthy()

    await b.service.undoCompletion(id)
    expect((await session(u).service.getDayPlan(TODAY)).occurrences[0]).toMatchObject({ completion: 0, completedAt: null })
  })

  it('every date shows exactly the tasks the recurrence rules say it should (checked against an independent calendar oracle)', async () => {
    const u = await fresh()
    const { service } = session(u)
    const rules = [
      { title: 'Daily', recurrence: 'daily', startsOn: '2026-03-01' },
      { title: 'MonWedFri', recurrence: 'weekly', weekdays: [1, 3, 5], startsOn: '2026-03-01' },
      { title: 'WeekendOnly', recurrence: 'weekly', weekdays: [6, 7], startsOn: '2026-03-01' },
      { title: 'StartsTomorrow', recurrence: 'daily', startsOn: '2026-03-11' },
      { title: 'EndedLastWeek', recurrence: 'daily', startsOn: '2026-03-01', endsOn: '2026-03-07' },
      { title: 'Midweek', recurrence: 'weekly', weekdays: [3], startsOn: '2026-03-12', endsOn: '2026-03-31' },
    ]
    const templates = []
    for (const r of rules) templates.push({ ...r, weekdays: r.weekdays ?? null, endsOn: r.endsOn ?? null, ...(await service.createTemplate(r)) , ...r })
    await service.createTask('2026-03-12', { title: 'OneOff' })
    const oneOff = { title: 'OneOff', recurrence: 'once', startsOn: '2026-03-12', endsOn: '2026-03-12' }

    const seen = {}
    for (let d = '2026-03-04'; d <= '2026-03-16'; d = addDays(d, 1)) {
      const plan = await service.openDay(d) // today is 03-10: the editable window starts 03-04
      const expected = [...rules, oneOff].filter((t) => occursOracle({ ...t, weekdays: t.weekdays ?? null }, d)).map((t) => t.title).sort()
      expect(plan.occurrences.map((o) => o.title).sort(), d).toEqual(expected)
      expect(plan.occurrences.every((o) => o.planDate === d)).toBe(true)
      seen[d] = plan.occurrences.map((o) => `${o.id}:${o.title}`).sort()
    }
    // Navigating again, from a new session, shows the same thing and creates nothing.
    const again = session(u).service
    for (const d of Object.keys(seen)) expect((await again.getDayPlan(d)).occurrences.map((o) => `${o.id}:${o.title}`).sort(), d).toEqual(seen[d])
    expect(await count(db, 'task_occurrences', 'user_id = $1', [u])).toBe(Object.values(seen).flat().length)
    void templates
  })

  it('a day with no tasks is an empty plan with no percentage, and a rest day is identifiable even with tasks (flow 10)', async () => {
    const u = await fresh()
    const { service } = session(u)
    expect((await service.openDay(TODAY)).summary).toMatchObject({ kind: 'empty', current: { count: 0, percent: null } })
    await service.createTask(TODAY, { title: 'Read' })
    await service.setDayMode(TODAY, 'rest')
    expect((await service.getDayPlan(TODAY)).summary).toMatchObject({ kind: 'rest', isRestDay: true })
    expect((await service.getDayPlan(TODAY)).occurrences).toHaveLength(1)
  })
})

// =====================================================================================
describe('"today" and the editing window: the JavaScript logic and the database agree (flow 12)', () => {
  const CASES = [
    ['America/New_York', ['2026-03-10T03:59:30Z', '2026-03-10T04:00:00Z', '2026-03-08T04:59:30Z', '2026-03-08T05:00:00Z', '2026-03-09T03:59:30Z', '2026-03-09T04:00:00Z']],
    ['Asia/Kolkata', ['2026-03-09T18:29:59Z', '2026-03-09T18:30:00Z']],
    ['Pacific/Kiritimati', ['2026-03-09T09:59:59Z', '2026-03-09T10:00:00Z']],
    ['Pacific/Auckland', ['2026-03-09T10:59:59Z', '2026-03-09T11:00:00Z']],
    ['Australia/Lord_Howe', ['2026-03-09T12:59:59Z', '2026-03-09T13:00:00Z']],
    ['America/Havana', ['2026-03-08T04:59:59Z', '2026-03-08T05:00:00Z']], // midnight does not exist on 2026-03-08
    ['UTC', ['2026-03-09T23:59:59Z', '2026-03-10T00:00:00Z']],
  ]
  it.each(CASES)('%s: the service and the database compute the same local date and the same 7-date window at every instant', async (zone, instants) => {
    for (const instant of instants) {
      await setNow(instant)
      const u = await fresh(zone)
      const { service, client } = session(u)
      const today = (await service.getToday()).today
      const dbToday = (await asUser(db, u, (d) => d.query('select to_char(public.planner_today($1), \'YYYY-MM-DD\') as t', [u]))).rows[0].t
      expect(today, `${zone} @ ${instant}`).toBe(dbToday)
      // The database's window agrees: today-6 can be created, today-7 cannot.
      const open = await client.from('day_plans').insert({ user_id: u, plan_date: addDays(today, -6) }).select('plan_date')
      const locked = await client.from('day_plans').insert({ user_id: u, plan_date: addDays(today, -7) }).select('plan_date')
      expect(open.error, `${zone} @ ${instant} today-6`).toBeNull()
      expect(locked.error?.code, `${zone} @ ${instant} today-7`).toBe('42501')
      // And so does the service.
      expect((await service.openDay(addDays(today, -6))).exists).toBe(true)
      expect((await fail(service.openDay(addDays(today, -7)))).details.plannerCode).toBe('DATE_NOT_EDITABLE')
    }
  })

  it('changing the profile timezone moves "today" and the window, and never touches stored history', async () => {
    await setNow('2026-03-10T20:00:00Z') // 16:00 on 03-10 in New York; 01:30 on 03-11 in Kolkata
    const u = await fresh()
    const { service, client } = session(u)
    await service.createTemplate({ title: 'Walk', recurrence: 'daily', startsOn: '2026-03-01' })
    const oldDay = await service.openDay('2026-03-04') // today-6 in New York: editable
    await service.setCompletion(oldDay.occurrences[0].id, 1)
    const before = await digest(u)
    expect((await service.getToday()).today).toBe('2026-03-10')

    const changed = await client.from('profiles').update({ timezone: 'Asia/Kolkata' }).eq('id', u).select('timezone')
    expect(changed.error).toBeNull()
    expect((await service.getToday())).toEqual({ today: '2026-03-11', timeZone: 'Asia/Kolkata' })
    expect(await digest(u)).toBe(before) // nothing stored was rewritten

    // 03-04 is now seven days back: read-only, but still readable.
    const e = await fail(service.setCompletion(oldDay.occurrences[0].id, 0))
    expect(e.details.plannerCode).toBe('DATE_NOT_EDITABLE')
    expect((await service.getDayPlan('2026-03-04')).occurrences[0].completion).toBe(1)
    expect((await service.getDayPlan('2026-03-04')).access).toBe('read_only_past')
    expect((await fail(service.openDay('2026-03-04'))).details.plannerCode).toBe('DATE_NOT_EDITABLE')
  })
})

// =====================================================================================
describe('user switching and session expiry never leak or lose data (flow 11)', () => {
  it('the service holds no per-user state: switching user, signing out and back in behave correctly', async () => {
    const alice = await fresh()
    const bob = await fresh()
    const s = session(alice)
    await s.service.createTask(TODAY, { title: 'Alice only' })
    const aliceId = (await s.service.getDayPlan(TODAY)).occurrences[0].id

    s.as(bob) // another user on the very same client and service instance
    expect(await s.service.getDayPlan(TODAY)).toMatchObject({ exists: false, occurrences: [] })
    expect(await s.service.listTemplates({ includeArchived: true })).toEqual([])
    expect((await fail(s.service.setCompletion(aliceId, 1))).code).toBe(SERVICE_ERROR.NOT_FOUND)
    await s.service.createTask(TODAY, { title: 'Bob only' })

    s.as(null) // the session expires
    expect((await fail(s.service.getDayPlan(TODAY))).code).toBe(SERVICE_ERROR.AUTH_REQUIRED)
    expect((await fail(s.service.setCompletion(aliceId, 1))).code).toBe(SERVICE_ERROR.AUTH_REQUIRED)

    s.as(alice) // and Alice signs back in
    expect((await s.service.getDayPlan(TODAY)).occurrences.map((o) => o.title)).toEqual(['Alice only'])
    s.as(bob)
    expect((await s.service.getDayPlan(TODAY)).occurrences.map((o) => o.title)).toEqual(['Bob only'])
    expect(Number((await one(db, 'select completion from public.task_occurrences where id = $1', [aliceId])).completion)).toBe(0)
  })

  it('two users with identical templates and dates never bleed into each other', async () => {
    const [a, b] = [await fresh(), await fresh()]
    const sa = session(a).service
    const sb = session(b).service
    for (const s of [sa, sb]) {
      await s.createTemplate({ title: 'Same', recurrence: 'daily', startsOn: '2026-03-01' })
      await s.openDay(TODAY)
    }
    const bBefore = await digest(b)
    const aId = (await sa.getDayPlan(TODAY)).occurrences[0].id
    await sa.setCompletion(aId, 1)
    await sa.setDayMode(TODAY, 'rest')
    await sa.rescheduleOccurrence(aId, '2026-03-12').catch(() => {})
    expect(await digest(b)).toBe(bBefore)
    expect((await sb.getDayPlan(TODAY))).toMatchObject({ day: { dayMode: 'normal', baselineAt: null } })
    expect((await sb.getDayPlan(TODAY)).occurrences[0].completion).toBe(0)
  })
})

// =====================================================================================
describe('history is preserved by edits (flows 3, 4, 5, 7)', () => {
  it('editing a task\'s details never changes its completion, timestamps, original-plan flag or the day\'s baseline', async () => {
    const u = await fresh()
    const { service } = session(u)
    await service.createTemplate({ title: 'Read', recurrence: 'daily', startsOn: '2026-03-01' })
    await service.createTemplate({ title: 'Walk', recurrence: 'daily', startsOn: '2026-03-01' })
    const plan = await service.openDay(TODAY)
    const [read, walk] = [plan.occurrences.find((o) => o.title === 'Read'), plan.occurrences.find((o) => o.title === 'Walk')]
    await service.setCompletion(read.id, 0.5)
    await service.setCompletion(walk.id, 1)
    const before = (await rowsOf(u))
    await service.updateOccurrence(read.id, { title: 'Read chapter 3', estimatedMinutes: 25, plannedStart: '20:00' })
    await service.updateOccurrence(walk.id, { description: 'around the park' })
    const after = await rowsOf(u)
    const keep = (r) => ({ id: r.id, completion: r.completion, completed_at: String(r.completed_at), plan_state: r.plan_state, in_original_plan: r.in_original_plan })
    expect(after.occs.map(keep)).toEqual(before.occs.map(keep))
    expect(String(after.days[0].baseline_at)).toBe(String(before.days[0].baseline_at))
    expect(after.occs.find((o) => o.id === read.id).title).toBe('Read chapter 3')
  })

  it('editing, archiving and deleting a recurring template leaves every recorded day exactly as it was', async () => {
    const u = await fresh()
    const { service } = session(u)
    const tpl = await service.createTemplate({ title: 'Stretch', recurrence: 'daily', startsOn: '2026-03-01', plannedStart: '07:00' })
    for (const d of ['2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09']) {
      const plan = await service.openDay(d)
      await service.setCompletion(plan.occurrences[0].id, d === '2026-03-07' ? 0.5 : 1)
    }
    await service.openDay(TODAY)
    const recorded = await digest(u, `t.plan_date < '${TODAY}'`)
    const snapshots = await service.listSnapshots({ from: '2026-03-06', to: '2026-03-09' })

    await service.updateTemplate(tpl.id, { title: 'Stretch + yoga', plannedStart: '06:00', estimatedMinutes: 30 })
    expect(await digest(u, `t.plan_date < '${TODAY}'`)).toBe(recorded)
    await service.archiveTemplate(tpl.id)
    expect(await digest(u, `t.plan_date < '${TODAY}'`)).toBe(recorded)
    expect(await service.listSnapshots({ from: '2026-03-06', to: '2026-03-09' })).toEqual(snapshots)

    await service.deleteTemplate(tpl.id)
    // Only the (cleared) link to the deleted template differs; every recorded value is intact.
    const rows = (await rowsOf(u)).occs.filter((o) => o.plan_date < TODAY)
    expect(rows).toHaveLength(4)
    expect(rows.map((o) => [o.plan_date, o.completion, o.title, o.template_id])).toEqual([
      ['2026-03-06', 1, 'Stretch', null], ['2026-03-07', 0.5, 'Stretch', null], ['2026-03-08', 1, 'Stretch', null], ['2026-03-09', 1, 'Stretch', null],
    ])
  })

  it('moving a task keeps the original on its date with its progress and reason, and undoing restores it exactly', async () => {
    const u = await fresh()
    const { service } = session(u)
    await service.createTemplate({ title: 'Report', recurrence: 'once', startsOn: TODAY, endsOn: TODAY })
    await service.createTask(TODAY, { title: 'Other' })
    const plan = await service.openDay(TODAY)
    const report = plan.occurrences.find((o) => o.title === 'Report')
    await service.setCompletion(report.id, 0.5)
    const originalRow = (await rowsOf(u)).occs.find((o) => o.id === report.id)
    const { target } = await service.rescheduleOccurrence(report.id, '2026-03-12')
    const moved = (await rowsOf(u)).occs.find((o) => o.id === report.id)
    expect(moved).toMatchObject({ plan_date: TODAY, completion: 0.5, plan_state: 'excluded', excluded_reason: 'rescheduled', in_original_plan: true })
    expect(target).toMatchObject({ planDate: '2026-03-12', completion: 0, rescheduledFromId: report.id })
    await service.undoReschedule(report.id)
    const restored = (await rowsOf(u)).occs.find((o) => o.id === report.id)
    expect(restored).toMatchObject({ plan_date: TODAY, completion: 0.5, plan_state: 'active', excluded_reason: null, in_original_plan: true })
    expect(String(restored.completed_at)).toBe(String(originalRow.completed_at))
  })
})

// =====================================================================================
describe('errors never expose internals (flow 10)', () => {
  const LEAK = /task_occurrences|task_templates|day_plans|profiles|public\.|\bselect\b|\binsert into\b|\bupdate\b .* \bset\b|violates|constraint|row-level|policy|jwt|secret|password|apikey|service_role|postgres|pgrst|sqlstate|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

  async function battery() {
    const alice = await fresh()
    const bob = await fresh()
    const a = session(alice)
    await a.service.createTemplate({ title: 'Alice', recurrence: 'daily', startsOn: '2026-03-01' })
    const aliceOcc = (await a.service.openDay(TODAY)).occurrences[0]
    await a.service.setCompletion(aliceOcc.id, 1)
    const b = session(bob)
    const bobOcc = (await (async () => { await b.service.createTask(TODAY, { title: 'Bob' }); return b.service.getDayPlan(TODAY) })()).occurrences[0]
    const old = await occurrence(db, bob, '2026-03-02', { title: 'History', completion: 1 })
    const missing = '99999999-9999-4999-8999-999999999999'
    const errors = []
    const collect = async (label, p) => errors.push([label, await fail(p)])
    await collect('others-record complete', b.service.setCompletion(aliceOcc.id, 1))
    await collect('others-record aside', b.service.setAside(aliceOcc.id, 'busy_day'))
    await collect('others-record move', b.service.rescheduleOccurrence(aliceOcc.id, '2026-03-12'))
    await collect('missing record', b.service.restore(missing))
    await collect('bad id', b.service.setCompletion('nope', 1))
    await collect('bad value', b.service.setCompletion(bobOcc.id, 0.3))
    await collect('done then aside', (async () => { await b.service.setCompletion(bobOcc.id, 1); return b.service.setAside(bobOcc.id, 'busy_day') })())
    await collect('read-only day', b.service.setCompletion(old.id, 0))
    await collect('future progress', (async () => { const p = await b.service.createTask('2026-03-12', { title: 'later' }); return b.service.setCompletion(p.plan.occurrences[0].id, 1) })())
    await collect('invalid template', b.service.createTemplate({ title: '', recurrence: 'weekly', weekdays: [] }))
    await collect('bad mode', b.service.setDayMode(TODAY, 'festival'))
    await collect('too far ahead', b.service.openDay('2026-06-01'))
    await collect('signed out', (async () => { b.as(null); try { return await b.service.getDayPlan(TODAY) } finally { b.as(bob) } })())
    await collect('network', (async () => { const n = session(bob); const c = createPgliteClient(db, { getUserId: () => bob, hooks: { before: () => { throw new TypeError('Failed to fetch https://project.supabase.co/rest/v1/task_occurrences?apikey=secret') } } }); return createPlannerService({ getClient: () => c, clock: () => Date.parse(nowIso) }).getDayPlan(TODAY).finally(() => n) })())
    await collect('database rule', (async () => {
      const crowded = await fresh() // a user whose day is already at the per-day limit
      const c = session(crowded)
      await c.service.openDay(TODAY)
      await db.query(`insert into public.task_occurrences (user_id, plan_date, title) select $1, date '${TODAY}', 'T' || g from generate_series(1, 100) g`, [crowded])
      return c.service.createTask(TODAY, { title: 'cap' })
    })())
    return errors
  }

  it('no message, detail or serialised form of any failure contains SQL, table names, other users\' ids or credentials', async () => {
    const errors = await battery()
    expect(errors.length).toBeGreaterThan(12)
    // Recovery ids are the caller's OWN records, included on purpose so a half-finished multi-step
    // operation can be repaired (spec 16.5). They are checked to exist and belong to the caller below.
    const RECOVERY = ['templateId', 'targetId', 'failedOccurrenceId', 'appliedOccurrenceIds']
    const withoutRecovery = (e) => JSON.parse(JSON.stringify(e, (k, v) => (RECOVERY.includes(k) ? undefined : v)))
    for (const [label, e] of errors) {
      expect(e, label).toBeInstanceOf(PlannerServiceError)
      const clean = withoutRecovery(e)
      const visible = JSON.stringify({ name: clean.name, code: clean.code, message: e.message, details: clean.details })
      expect(visible, `${label}: ${visible}`).not.toMatch(LEAK)
      // A caller that naively serialises the error (logging, telemetry, a UI dump) must not get the raw database error either.
      expect(JSON.stringify(clean), `${label} (serialised error): ${JSON.stringify(clean)}`).not.toMatch(LEAK)
    }
    const partial = errors.find(([label]) => label === 'database rule')[1]
    expect(partial.details.partial).toBe('template_created')
    expect(await count(db, 'task_templates', 'id = $1', [partial.details.templateId])).toBe(1) // a real record of the caller's
  })

  it('the original error stays available for logging, but only deliberately', async () => {
    const errors = await battery()
    const withCause = errors.filter(([, e]) => e.cause !== undefined)
    expect(withCause.length).toBeGreaterThan(0)
    for (const [, e] of withCause) expect(Object.keys(e)).not.toContain('cause')
  })
})

// =====================================================================================
describe('randomised end-to-end run: the connected system keeps its promises', () => {
  const mulberry = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const DATES = Array.from({ length: 19 }, (_, i) => addDays('2026-03-02', i)) // 03-02 .. 03-20: history, the window, the future

  async function run(seed, steps) {
    const rnd = mulberry(seed)
    const pick = (list) => list[Math.floor(rnd() * list.length)]
    const u = await fresh()
    const bystander = await fresh()
    const { service } = session(u)
    const by = session(bystander).service
    await by.createTemplate({ title: 'Bystander', recurrence: 'daily', startsOn: '2026-03-01' })
    await by.openDay(TODAY)
    await by.setCompletion((await by.getDayPlan(TODAY)).occurrences[0].id, 0.5)
    const bystanderDigest = await digest(bystander)

    // read-only history, seeded as the owner (the app cannot create days this old)
    await occurrence(db, u, '2026-03-02', { title: 'old-a', completion: 1 })
    await occurrence(db, u, '2026-03-02', { title: 'old-b' })
    await db.query(`update public.day_plans set day_mode = 'busy' where user_id = $1 and plan_date = '2026-03-02'`, [u])
    await occurrence(db, u, '2026-03-03', { title: 'old-c', completion: 0.5 })
    const historyBefore = await digest(u, `t.plan_date < '2026-03-04'`)

    // A realistic starting point, so the random operations have real days and tasks to act on.
    await service.createTemplate({ title: 'Daily', recurrence: 'daily', startsOn: '2026-03-01', plannedStart: '07:00', estimatedMinutes: 30 })
    await service.createTemplate({ title: 'MonWedFri', recurrence: 'weekly', weekdays: [1, 3, 5], startsOn: '2026-03-01' })
    await service.createTemplate({ title: 'TueThuSat', recurrence: 'weekly', weekdays: [2, 4, 6], startsOn: '2026-03-01', isPriority: true })
    for (const d of ['2026-03-06', '2026-03-08', '2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12']) await service.openDay(d)
    // Monday is a rest day with some progress, Tuesday (today) a normal day: so every run's week has a rest day to exclude.
    await service.setDayMode('2026-03-09', 'rest')
    await service.setCompletion((await service.getDayPlan('2026-03-09')).occurrences[0].id, 1)

    const problems = []
    const refusals = {}
    const model = { completion: new Map(), original: new Map(), baseline: new Map(), mode: new Map() }
    let counter = 0
    const attempt = async (label, fn) => {
      try {
        return { ok: true, value: await fn() }
      } catch (e) {
        if (!(e instanceof PlannerServiceError)) throw e
        refusals[label] = (refusals[label] ?? 0) + 1
        // Allowed: the pure rules said no (no database code involved). A database-level refusal, or a write that
        // hit zero rows, means the logic and the database disagreed about what is allowed.
        const legit = [SERVICE_ERROR.VALIDATION, SERVICE_ERROR.CONFLICT, SERVICE_ERROR.NOT_FOUND].includes(e.code) && !e.details.dbCode && e.details.reason !== 'no_rows_affected' && e.details.reason !== 'delete_refused'
        if (!legit) problems.push(`step ${counter} ${label}: ${e.code} ${JSON.stringify(e.details)}`)
        return { ok: false, error: e }
      }
    }

    async function checkInvariants(label) {
      const { days, occs } = await rowsOf(u)
      const dayByDate = Object.fromEntries(days.map((d) => [d.plan_date, d]))
      const seen = new Set()
      const keys = new Set()
      for (const o of occs) {
        seen.add(o.id)
        if (![0, 0.5, 1].includes(o.completion)) problems.push(`${label}: bad completion ${o.completion}`)
        if (o.plan_state === 'excluded' && o.completion === 1) problems.push(`${label}: a done task is set aside`)
        if (o.completion > 0 && !o.completed_at) problems.push(`${label}: progress without a timestamp`)
        if (o.completion > 0 && !dayByDate[o.plan_date].baseline_at) problems.push(`${label}: progress on a day with no baseline`)
        if (o.template_id) {
          const k = `${o.template_id}|${o.plan_date}`
          if (keys.has(k)) problems.push(`${label}: duplicate occurrence ${k}`)
          keys.add(k)
        }
        if (model.completion.has(o.id) && model.completion.get(o.id) !== o.completion) problems.push(`${label}: completion of ${o.title} changed without a completion operation (${model.completion.get(o.id)} -> ${o.completion})`)
        if (!model.completion.has(o.id)) {
          // Rows that appear during the run must start pending (rows already there at the start were seeded on purpose).
          if (label !== 'start' && o.plan_date >= '2026-03-04' && o.completion !== 0) problems.push(`${label}: a new row did not start pending`)
        }
        model.completion.set(o.id, o.completion)
        if (model.original.has(o.id) && model.original.get(o.id) !== o.in_original_plan) problems.push(`${label}: original-plan flag changed for ${o.title}`)
        model.original.set(o.id, o.in_original_plan)
      }
      for (const [id, c] of model.completion) {
        if (!seen.has(id)) {
          if (c !== 0) problems.push(`${label}: a task with progress (${c}) disappeared`)
          model.completion.delete(id)
        }
      }
      for (const d of days) {
        const prev = model.baseline.get(d.plan_date)
        if (prev && String(prev) !== String(d.baseline_at)) problems.push(`${label}: baseline of ${d.plan_date} changed`)
        if (d.baseline_at) model.baseline.set(d.plan_date, d.baseline_at)
        if (model.mode.has(d.plan_date) && model.mode.get(d.plan_date) !== d.day_mode) problems.push(`${label}: day mode of ${d.plan_date} changed by itself`)
        model.mode.set(d.plan_date, d.day_mode)
        if (d.day_mode !== 'normal' && !d.baseline_at) problems.push(`${label}: Busy/Rest day without a baseline`)
      }
      if (await digest(u, `t.plan_date < '2026-03-04'`) !== historyBefore) problems.push(`${label}: read-only history changed`)
      if (await digest(bystander) !== bystanderDigest) problems.push(`${label}: another user's data changed`)
      return { days, occs }
    }

    async function checkSummaries(label, dates) {
      const { days, occs } = await rowsOf(u)
      for (const d of dates) {
        const dayRow = days.find((x) => x.plan_date === d)
        const plan = await service.getDayPlan(d)
        if (!dayRow) {
          if (plan.exists) problems.push(`${label}: ${d} exists for the service but not in the database`)
          continue
        }
        const expected = dayOracle(dayRow, occs.filter((o) => o.plan_date === d))
        const s = plan.summary
        const got = { kind: s.kind, revised: s.revised, current: { count: s.current.count, units: s.current.units, percent: s.current.percent }, original: s.original && { count: s.original.count, units: s.original.units, percent: s.original.percent } }
        if (JSON.stringify(got) !== JSON.stringify(expected)) problems.push(`${label}: summary for ${d} differs from the oracle: ${JSON.stringify(got)} vs ${JSON.stringify(expected)}`)
      }
    }

    async function checkWeek(label) {
      const { days, occs } = await rowsOf(u)
      const week = await service.getWeekSummary()
      const monday = addDays(TODAY, -(isoWeekday(TODAY) - 1))
      const entries = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).filter((d) => d <= TODAY).map((d) => {
        const row = days.find((x) => x.plan_date === d)
        if (!row) return null
        const o = dayOracle(row, occs.filter((x) => x.plan_date === d))
        const active = occs.filter((x) => x.plan_date === d && x.plan_state === 'active')
        return { ...o, done: active.filter((x) => x.completion === 1).length }
      }).filter(Boolean)
      const planned = entries.filter((e) => e.kind === 'planned')
      const meanExact = planned.length ? planned.reduce((a, e) => a + e.current.units / e.current.count, 0) / planned.length : null
      const allComplete = planned.length > 0 && planned.every((e) => e.current.units === e.current.count)
      let avg = null
      if (planned.length) {
        avg = allComplete ? 100 : Math.floor(meanExact * 100 + 0.5 + 1e-9)
        if (!allComplete && avg >= 100) avg = 99
        if (!allComplete && planned.some((e) => e.current.units > 0) && avg < 1) avg = 1
      }
      const want = {
        plannedDays: planned.length,
        restDays: entries.filter((e) => e.kind === 'rest').length,
        daysWithPlan: entries.filter((e) => e.kind !== 'empty').length,
        daysWithProgress: entries.filter((e) => e.current.units > 0).length,
        tasksDone: entries.reduce((a, e) => a + e.done, 0),
        averagePercent: avg,
        eligible: entries.filter((e) => e.kind !== 'empty').length >= 3,
      }
      const got = Object.fromEntries(Object.keys(want).map((k) => [k, week[k]]))
      if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${label}: weekly summary differs from the oracle: ${JSON.stringify(got)} vs ${JSON.stringify(want)}`)
      if (/streak/i.test(JSON.stringify(week))) problems.push(`${label}: a streak appeared in the weekly summary`)
    }

    const occList = async () => (await rowsOf(u)).occs
    const templateList = async () => (await service.listTemplates({ includeArchived: true }))
    const ops = [
      [18, 'openDay', () => attempt('openDay', () => service.openDay(pick(DATES)))],
      [10, 'createTask', () => attempt('createTask', () => service.createTask(pick(DATES), { title: `Task ${(counter += 1)}`, ...(rnd() < 0.4 ? { plannedStart: pick(['07:00', '12:30', '19:00']) } : {}), ...(rnd() < 0.4 ? { estimatedMinutes: pick([10, 30, 90]) } : {}), isPriority: rnd() < 0.3 }))],
      [7, 'createTemplate', () => attempt('createTemplate', () => {
        const kind = pick(['daily', 'weekly', 'weekly', 'once'])
        const startsOn = pick(DATES.slice(0, 10))
        const input = { title: `Tpl ${(counter += 1)}`, recurrence: kind, startsOn, weekdays: kind === 'weekly' ? [...new Set([1 + Math.floor(rnd() * 7), 1 + Math.floor(rnd() * 7)])] : null, endsOn: kind === 'once' ? startsOn : rnd() < 0.2 ? addDays(startsOn, 5) : null }
        return service.createTemplate(input)
      })],
      [22, 'setCompletion', async () => { const o = pick(await occList()); const v = rnd() < 0.05 ? 0.3 : pick([0, 0.5, 1, 1]); const r = await attempt('setCompletion', () => service.setCompletion(o.id, v)); if (r.ok && r.value.changed) model.completion.set(o.id, v) }],
      [8, 'setAside', async () => { const o = pick(await occList()); await attempt('setAside', () => service.setAside(o.id, pick(['busy_day', 'rest_day']))) }],
      [5, 'restore', async () => { const o = pick(await occList()); await attempt('restore', () => service.restore(o.id)) }],
      [6, 'removeOccurrence', async () => { const o = pick(await occList()); await attempt('removeOccurrence', () => service.removeOccurrence(o.id)) }],
      [7, 'reschedule', async () => { const o = pick(await occList()); await attempt('reschedule', () => service.rescheduleOccurrence(o.id, pick(DATES), rnd() < 0.3 ? { plannedStart: '16:00', plannedEnd: '17:00' } : {})) }],
      [3, 'undoReschedule', async () => { const o = pick(await occList()); await attempt('undoReschedule', () => service.undoReschedule(o.id)) }],
      [5, 'setDayMode', async () => { const d = pick(DATES); const m = pick(['normal', 'busy', 'rest']); const r = await attempt('setDayMode', () => service.setDayMode(d, m)); if (r.ok) model.mode.set(d, m) }],
      [3, 'updateOccurrence', async () => { const o = pick(await occList()); await attempt('updateOccurrence', () => service.updateOccurrence(o.id, { title: `Edited ${(counter += 1)}`, estimatedMinutes: pick([15, 45]) })) }],
      [2, 'updateTemplate', async () => { const t = await templateList(); if (t.length) await attempt('updateTemplate', () => service.updateTemplate(pick(t).id, { title: `Renamed ${(counter += 1)}`, plannedStart: '08:15' })) }],
      [1, 'archiveTemplate', async () => { const t = await templateList(); if (t.length) await attempt('archiveTemplate', () => service.archiveTemplate(pick(t).id)) }],
      [1, 'deleteTemplate', async () => { const t = await templateList(); if (t.length > 3) await attempt('deleteTemplate', () => service.deleteTemplate(pick(t).id)) }],
    ]
    const total = ops.reduce((a, [w]) => a + w, 0)
    await checkInvariants('start')

    // Deliberate probes at the edges, every run. The rules must refuse each one BEFORE the database is asked
    // (a refusal that only comes from the database would be flagged as a logic/database disagreement).
    const todays = (await rowsOf(u)).occs.filter((o) => o.plan_date === TODAY && o.plan_state === 'active' && o.completion === 0)
    for (const [label, target] of [['read-only target', '2026-03-03'], ['too far ahead', '2026-04-20'], ['same day', TODAY]]) {
      const probe = await attempt(`probe: reschedule to ${label}`, () => service.rescheduleOccurrence(todays[0].id, target))
      if (probe.ok) problems.push(`probe: rescheduling to a ${label} day was allowed`)
    }
    const futureProbe = await attempt('probe: progress on a future day', async () => {
      const future = (await service.getDayPlan('2026-03-12')).occurrences[0]
      return service.setCompletion(future.id, 1)
    })
    if (futureProbe.ok) problems.push('probe: progress on a future day was allowed')
    await checkInvariants('after probes')
    for (let i = 0; i < steps; i += 1) {
      counter = i
      let r = rnd() * total
      for (const [w, , fn] of ops) {
        r -= w
        if (r < 0) { await fn(); break }
      }
      await checkInvariants(`after step ${i}`)
      if (i % 12 === 11) await checkSummaries(`step ${i}`, DATES)
    }
    await checkSummaries('final', DATES)
    await checkWeek('final')
    return { problems, refusals, rows: await rowsOf(u) }
  }

  it.each([[101, 45], [202, 45], [303, 45]])('seed %i, %i operations: no invariant is violated and the logic never disagrees with the database', async (seed, steps) => {
    const { problems, refusals, rows } = await run(seed, steps)
    expect(problems).toEqual([])
    // The run must actually exercise the system: plenty of real writes, and the rules saying "no" at times.
    expect(rows.occs.length).toBeGreaterThan(20)
    expect(Object.values(refusals).reduce((a, b) => a + b, 0)).toBeGreaterThan(3)
    expect(rows.occs.some((o) => o.completion > 0)).toBe(true)
    expect(rows.occs.some((o) => o.plan_state === 'excluded')).toBe(true)
  }, 240000)
})

// keep the helpers referenced for readers
void day
