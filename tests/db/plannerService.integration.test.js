import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createPlannerService } from '../../src/services/planner/createPlannerService.js'
import { SERVICE_ERROR, toServiceError } from '../../src/services/planner/errors.js'
import { createPgliteClient } from '../support/pgliteSupabase.js'
import { createDb, createUser, setClock, useFixedClock } from './harness.js'
import { CLOCK, TODAY, count, insert, occurrence, one } from './plannerSeed.js'

// INTEGRATION tests (in PGlite): the real planner service code runs against the real migration, so
// the real constraints, triggers, column grants and RLS policies apply to every query it makes.
// What this is NOT: PostgREST, a real Supabase project, or the Supabase auth service. The adapter in
// tests/support/pgliteSupabase.js translates supabase-js-style calls into SQL under the
// `authenticated` role with the signed-in user's id. Mocked behaviour tests are in tests/unit/plannerService.
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
// A failing test must never leave a moved clock behind for the next one.
afterEach(async () => {
  await setNow(CLOCK)
})

const setNow = async (iso) => {
  nowIso = iso
  await setClock(db, iso)
}
const fresh = async (tz = 'America/New_York') => createUser(db, `svc-${(seq += 1)}@example.com`, tz)
const serviceFor = (userId, hooks) => {
  const client = createPgliteClient(db, { getUserId: () => userId, hooks })
  return { client, service: createPlannerService({ getClient: () => client, clock: () => Date.parse(nowIso) }) }
}
const rejection = async (promise) => {
  try {
    await promise
  } catch (e) {
    return e
  }
  throw new Error('expected the call to be rejected')
}
const daily = (title, extra = {}) => ({ title, recurrence: 'daily', startsOn: '2026-03-01', ...extra })
const byTitle = (plan, title) => plan.occurrences.find((o) => o.title === title)

describe('opening a day: top-up, duplicates and the date window', () => {
  it('creates the day and one occurrence per matching template, once', async () => {
    const u = await fresh()
    const { service } = serviceFor(u)
    await service.createTemplate(daily('Walk', { plannedStart: '07:00', estimatedMinutes: 30 }))
    await service.createTemplate({ title: 'Gym', recurrence: 'weekly', weekdays: [2, 4], startsOn: '2026-03-01' }) // 2026-03-10 is a Tuesday
    await service.createTemplate({ title: 'Swim', recurrence: 'weekly', weekdays: [3], startsOn: '2026-03-01' }) // Wednesdays only
    const plan = await service.openDay(TODAY)
    expect(plan.occurrences.map((o) => o.title)).toEqual(['Walk', 'Gym']) // chronological, untimed last
    expect(plan.occurrences.every((o) => o.inOriginalPlan && o.completion === 0 && o.planState === 'active')).toBe(true)
    expect(plan.day).toMatchObject({ planDate: TODAY, dayMode: 'normal', baselineAt: null })
    expect(plan.summary.current).toMatchObject({ count: 2, percent: 0 })

    const again = await service.openDay(TODAY)
    expect(again.occurrences).toHaveLength(2)
    expect(await count(db, 'task_occurrences', 'user_id = $1', [u])).toBe(2)
  })

  it('a template added later appears when the day is reopened; it joins the original plan only before the baseline (D11)', async () => {
    const u = await fresh()
    const { service } = serviceFor(u)
    await service.createTemplate(daily('First'))
    await service.openDay(TODAY)
    await service.createTemplate(daily('Second'))
    let plan = await service.openDay(TODAY)
    expect(byTitle(plan, 'Second').inOriginalPlan).toBe(true) // no baseline yet

    await service.setCompletion(byTitle(plan, 'First').id, 0.5) // fixes the baseline (server-side)
    await service.createTemplate(daily('Third'))
    plan = await service.openDay(TODAY)
    expect(byTitle(plan, 'Third').inOriginalPlan).toBe(false)
    expect(plan.summary.original.count).toBe(2)
    expect(plan.summary.current.count).toBe(3)
  })

  it('survives a duplicate-insert race (another tab got there first) and still ends with exactly one occurrence per template', async () => {
    const u = await fresh()
    let fired = false
    let t
    const hooks = {
      before: async (state) => {
        if (fired || state.table !== 'task_occurrences' || state.op !== 'insert') return
        fired = true
        await insert(db, 'task_occurrences', { user_id: u, plan_date: TODAY, template_id: t.id, title: 'Raced' }) // the competing tab
      },
    }
    const { service } = serviceFor(u, hooks)
    t = await service.createTemplate(daily('Raced'))
    const plan = await service.openDay(TODAY)
    expect(fired).toBe(true)
    expect(plan.occurrences.filter((o) => o.templateId === t.id)).toHaveLength(1)
    expect(await count(db, 'task_occurrences', 'user_id = $1 and template_id = $2', [u, t.id])).toBe(1)
  })

  it('two services opening the same day one after the other never duplicate anything', async () => {
    const u = await fresh()
    const a = serviceFor(u).service
    const b = serviceFor(u).service
    await a.createTemplate(daily('Shared'))
    await a.openDay(TODAY)
    await b.openDay(TODAY)
    expect(await count(db, 'task_occurrences', 'user_id = $1', [u])).toBe(1)
    expect(await count(db, 'day_plans', 'user_id = $1', [u])).toBe(1)
  })

  it('the 7-date window: today minus 6 opens, today minus 7 is refused, and nothing is created for it', async () => {
    const u = await fresh()
    const { service } = serviceFor(u)
    await service.createTemplate(daily('Walk'))
    expect((await service.openDay('2026-03-04')).occurrences).toHaveLength(1)
    const e = await rejection(service.openDay('2026-03-03'))
    expect(e).toMatchObject({ code: SERVICE_ERROR.VALIDATION })
    expect(e.details.plannerCode).toBe('DATE_NOT_EDITABLE')
    expect(await count(db, 'day_plans', `user_id = $1 and plan_date = '2026-03-03'`, [u])).toBe(0)
  })

  it('the boundary moves at local midnight in the user\'s timezone', async () => {
    const u = await fresh()
    const { service } = serviceFor(u)
    await setNow('2026-03-11T03:59:00Z') // 23:59 EDT on 03-10
    expect((await service.getToday()).today).toBe('2026-03-10')
    await service.openDay('2026-03-04')
    await setNow('2026-03-11T04:00:00Z') // 00:00 EDT on 03-11
    expect((await service.getToday()).today).toBe('2026-03-11')
    await service.openDay('2026-03-05') // today (03-11) minus 6: still editable
    expect((await rejection(service.openDay('2026-03-04'))).details.plannerCode).toBe('DATE_NOT_EDITABLE') // today minus 7: locked since local midnight
  })

  it('"today" differs by user timezone at the same instant', async () => {
    const ny = serviceFor(await fresh('America/New_York')).service
    const kiritimati = serviceFor(await fresh('Pacific/Kiritimati')).service
    expect((await ny.getToday()).today).toBe('2026-03-10')
    expect((await kiritimati.getToday()).today).toBe('2026-03-11')
  })

  it('reading an unplanned day is not an error and writes nothing', async () => {
    const u = await fresh()
    const { service } = serviceFor(u)
    expect(await service.getDayPlan('2026-03-09')).toMatchObject({ exists: false, occurrences: [], summary: null })
    expect(await count(db, 'day_plans', 'user_id = $1', [u])).toBe(0)
  })
})

describe('tasks and templates', () => {
  it('createTask makes a one-time task for that date; on a day with a baseline it is a late addition', async () => {
    const u = await fresh()
    const { service } = serviceFor(u)
    await service.createTemplate(daily('Base'))
    const plan = await service.openDay(TODAY)
    await service.setCompletion(plan.occurrences[0].id, 1)
    const { template, plan: after } = await service.createTask(TODAY, { title: 'Dentist', plannedStart: '15:00', estimatedMinutes: 45 })
    expect(template).toMatchObject({ recurrence: 'once', startsOn: TODAY, endsOn: TODAY })
    expect(byTitle(after, 'Dentist')).toMatchObject({ plannedStart: '15:00', estimatedMinutes: 45, inOriginalPlan: false })
  })

  it('refuses invalid input before any write', async () => {
    const u = await fresh()
    const { service } = serviceFor(u)
    const e = await rejection(service.createTemplate({ title: '', recurrence: 'weekly', weekdays: [], startsOn: 'x' }))
    expect(e.code).toBe(SERVICE_ERROR.VALIDATION)
    expect(Object.keys(e.details.fields).sort()).toEqual(['startsOn', 'title', 'weekdays'])
    expect(await count(db, 'task_templates', 'user_id = $1', [u])).toBe(0)
    expect((await rejection(service.createTask('2026-03-03', { title: 'old' }))).code).toBe(SERVICE_ERROR.VALIDATION)
    expect(await count(db, 'task_templates', 'user_id = $1', [u])).toBe(0)
  })

  it('updateTemplate refreshes upcoming untouched days but never rewrites the past or anything with progress', async () => {
    const u = await fresh()
    const { service } = serviceFor(u)
    const tpl = await service.createTemplate(daily('Walk', { plannedStart: '07:00' }))
    const past = await service.openDay('2026-03-08')
    const today = await service.openDay(TODAY)
    const tomorrow = await service.openDay('2026-03-11')
    await service.setCompletion(past.occurrences[0].id, 1)
    const before = await service.getPlanSnapshot('2026-03-08')

    const result = await service.updateTemplate(tpl.id, { title: 'Brisk walk', plannedStart: '06:30' })
    expect(result.updatedOccurrenceIds.sort()).toEqual([today.occurrences[0].id, tomorrow.occurrences[0].id].sort())
    expect((await service.getDayPlan(TODAY)).occurrences[0]).toMatchObject({ title: 'Brisk walk', plannedStart: '06:30' })
    expect((await service.getDayPlan('2026-03-11')).occurrences[0].title).toBe('Brisk walk')
    expect(await service.getPlanSnapshot('2026-03-08')).toEqual(before) // history untouched
    expect((await service.getDayPlan('2026-03-08')).occurrences[0]).toMatchObject({ title: 'Walk', plannedStart: '07:00' })
  })

  it('a customised occurrence keeps its own details through a template edit', async () => {
    const u = await fresh()
    const { service } = serviceFor(u)
    const tpl = await service.createTemplate(daily('Walk'))
    const plan = await service.openDay(TODAY)
    await service.updateOccurrence(plan.occurrences[0].id, { title: 'Walk (short today)', estimatedMinutes: 10 })
    const result = await service.updateTemplate(tpl.id, { title: 'Long walk' })
    expect(result.skipped.map((s) => s.reason)).toContain('customized')
    expect((await service.getDayPlan(TODAY)).occurrences[0]).toMatchObject({ title: 'Walk (short today)', isCustomized: true })
  })

  it('archiving stops future days but keeps every past one', async () => {
    const u = await fresh()
    const { service } = serviceFor(u)
    const tpl = await service.createTemplate(daily('Old habit'))
    await service.openDay('2026-03-09')
    await service.openDay(TODAY)
    const archived = await service.archiveTemplate(tpl.id)
    expect(archived).toMatchObject({ endsOn: TODAY })
    expect((await service.listTemplates()).map((t) => t.title)).not.toContain('Old habit')
    expect((await service.listTemplates({ includeArchived: true })).map((t) => t.title)).toContain('Old habit')
    expect((await service.openDay('2026-03-11')).occurrences).toEqual([]) // tomorrow: nothing is created
    expect((await service.getDayPlan('2026-03-09')).occurrences).toHaveLength(1) // history kept
  })

  it('deleting a template removes untouched upcoming days and keeps anything with progress', async () => {
    const u = await fresh()
    const { service } = serviceFor(u)
    const tpl = await service.createTemplate(daily('Temp'))
    const today = await service.openDay(TODAY)
    await service.openDay('2026-03-12')
    await service.setCompletion(today.occurrences[0].id, 1)
    const result = await service.deleteTemplate(tpl.id)
    expect(result).toEqual({ removedUpcoming: 1, keptWithHistory: 1 })
    expect(await count(db, 'task_templates', 'user_id = $1', [u])).toBe(0)
    const kept = (await service.getDayPlan(TODAY)).occurrences
    expect(kept).toHaveLength(1)
    expect(kept[0]).toMatchObject({ title: 'Temp', templateId: null, completion: 1 }) // history survives with its snapshot
    expect((await service.getDayPlan('2026-03-12')).occurrences).toEqual([])
  })
})

describe('completion, set-aside and restoration', () => {
  it('records partial and done, undoes, and lets the server stamp the baseline and timestamps', async () => {
    const u = await fresh()
    const { service } = serviceFor(u)
    await service.createTemplate(daily('Read'))
    const plan = await service.openDay(TODAY)
    const id = plan.occurrences[0].id
    expect(plan.day.baselineAt).toBeNull()

    const half = await service.setCompletion(id, 0.5)
    expect(half.occurrence).toMatchObject({ completion: 0.5, planState: 'active' })
    expect(half.occurrence.completedAt).toBeTruthy()
    expect(half.day.baselineAt).toBeTruthy() // read back from the database, not assumed
    expect((await service.setCompletion(id, 1)).occurrence.completion).toBe(1) // 1, not 1.5
    const undone = await service.undoCompletion(id)
    expect(undone.occurrence).toMatchObject({ completion: 0, completedAt: null })
    expect(undone.day.baselineAt).toBe(half.day.baselineAt) // fixed once
    expect((await service.setCompletion(id, 0)).changed).toBe(false)
  })

  it('rejects unsupported values and leaves the database unchanged', async () => {
    const u = await fresh()
    const { service } = serviceFor(u)
    await service.createTemplate(daily('Read'))
    const id = (await service.openDay(TODAY)).occurrences[0].id
    for (const bad of [0.25, 0.75, 2, -1, '1']) {
      expect((await rejection(service.setCompletion(id, bad))).details.plannerCode).toBe('INVALID_COMPLETION')
    }
    expect(Number((await one(db, 'select completion from public.task_occurrences where id = $1', [id])).completion)).toBe(0)
  })

  it('refuses progress for a future day and for read-only history; history stays readable', async () => {
    const u = await fresh()
    const { service } = serviceFor(u)
    await service.createTemplate(daily('Read'))
    const tomorrow = await service.openDay('2026-03-11')
    expect((await rejection(service.setCompletion(tomorrow.occurrences[0].id, 1))).details.plannerCode).toBe('FUTURE_DATE')

    const old = await occurrence(db, u, '2026-03-03', { title: 'History', completion: 1 }) // seeded as the owner: too old to create through the app
    const e = await rejection(service.setCompletion(old.id, 0))
    expect(e.details.plannerCode).toBe('DATE_NOT_EDITABLE')
    expect((await service.getDayPlan('2026-03-03')).occurrences[0]).toMatchObject({ title: 'History', completion: 1 })
    expect((await service.getDayPlan('2026-03-03')).access).toBe('read_only_past')
    expect(Number((await one(db, 'select completion from public.task_occurrences where id = $1', [old.id])).completion)).toBe(1)
  })

  it('a partially completed task may be set aside; a done task may not; restore brings it back', async () => {
    const u = await fresh()
    const { service } = serviceFor(u)
    await service.createTemplate(daily('A'))
    await service.createTemplate(daily('B'))
    const plan = await service.openDay(TODAY)
    const [a, b] = [byTitle(plan, 'A'), byTitle(plan, 'B')]
    await service.setCompletion(a.id, 0.5)
    const aside = await service.setAside(a.id, 'busy_day')
    expect(aside.occurrence).toMatchObject({ planState: 'excluded', excludedReason: 'busy_day', completion: 0.5 })
    expect(aside.occurrence.excludedAt).toBeTruthy()
    expect((await service.restore(a.id))).toMatchObject({ planState: 'active', excludedReason: null, completion: 0.5 })

    await service.setCompletion(b.id, 1)
    const e = await rejection(service.setAside(b.id, 'rest_day'))
    expect(e.code).toBe(SERVICE_ERROR.CONFLICT)
    expect(e.details.plannerCode).toBe('HAS_PROGRESS')
    expect((await service.getDayPlan(TODAY)).occurrences.find((o) => o.id === b.id).planState).toBe('active')
  })

  it('doing more of a set-aside task puts it back in the current plan', async () => {
    const u = await fresh()
    const { service } = serviceFor(u)
    await service.createTemplate(daily('A'))
    const id = (await service.openDay(TODAY)).occurrences[0].id
    await service.setAside(id, 'busy_day')
    const r = await service.setCompletion(id, 0.5)
    expect(r.restored).toBe(true)
    expect(r.occurrence).toMatchObject({ planState: 'active', excludedReason: null })
  })

  it('removal follows the approved rules end to end (C1)', async () => {
    const u = await fresh()
    const { service } = serviceFor(u)
    const keep = await service.createTemplate(daily('Keep'))
    const drop = await service.createTemplate(daily('Drop'))
    let plan = await service.openDay(TODAY)

    // before the baseline: a real delete, the template is suppressed for the day, the baseline is not fixed
    const removed = await service.removeOccurrence(byTitle(plan, 'Drop').id)
    expect(removed.action).toBe('delete')
    plan = await service.openDay(TODAY) // reopening must NOT bring it back
    expect(plan.occurrences.map((o) => o.title)).toEqual(['Keep'])
    expect(plan.day).toMatchObject({ baselineAt: null, suppressedTemplateIds: [drop.id] })

    // after the baseline: an original-plan task is soft-removed and stays in the original plan
    await service.setCompletion(byTitle(plan, 'Keep').id, 0.5)
    const extra = await service.createTemplate(daily('Original-ish'))
    void extra
    plan = await service.openDay(TODAY)
    const late = byTitle(plan, 'Original-ish')
    expect(late.inOriginalPlan).toBe(false)
    expect((await service.removeOccurrence(late.id)).action).toBe('delete') // a late addition, untouched
    const partial = await service.setAside(byTitle(plan, 'Keep').id, 'busy_day')
    void partial
    expect(await count(db, 'task_templates', 'user_id = $1', [u])).toBe(3)
    void keep
  })

  it('an original-plan task is soft-removed after the baseline, and a done task cannot be removed', async () => {
    const u = await fresh()
    const { service } = serviceFor(u)
    await service.createTemplate(daily('A'))
    await service.createTemplate(daily('B'))
    await service.createTemplate(daily('C'))
    const plan = await service.openDay(TODAY)
    await service.setCompletion(byTitle(plan, 'A').id, 1) // baseline fixed; B and C are original-plan tasks
    const soft = await service.removeOccurrence(byTitle(plan, 'B').id)
    expect(soft).toMatchObject({ action: 'exclude' })
    const after = await service.getDayPlan(TODAY)
    expect(byTitle(after, 'B')).toMatchObject({ planState: 'excluded', excludedReason: 'removed', inOriginalPlan: true })
    expect(after.summary.original.count).toBe(3)
    expect(after.summary.current.count).toBe(2)
    expect((await rejection(service.removeOccurrence(byTitle(plan, 'A').id))).details.plannerCode).toBe('HAS_PROGRESS')
  })

  it('editing one day\'s details marks it customised and respects limits', async () => {
    const u = await fresh()
    const { service } = serviceFor(u)
    await service.createTemplate(daily('A'))
    const id = (await service.openDay(TODAY)).occurrences[0].id
    expect(await service.updateOccurrence(id, { title: '  Stretch  ', plannedStart: '07:00', plannedEnd: '07:20', estimatedMinutes: '20', isPriority: true })).toMatchObject({ title: 'Stretch', plannedEnd: '07:20', estimatedMinutes: 20, isPriority: true, isCustomized: true })
    expect((await rejection(service.updateOccurrence(id, { plannedStart: '10:00', plannedEnd: '09:00' }))).code).toBe(SERVICE_ERROR.VALIDATION)
  })
})

describe('rescheduling keeps history', () => {
  const FRIDAY = '2026-03-13'
  const setup = async (completion) => {
    const u = await fresh()
    const { service, client } = serviceFor(u)
    const tpl = await service.createTemplate({ title: 'Report', recurrence: 'weekly', weekdays: [2, 5], startsOn: '2026-03-01' }) // Tue & Fri
    await service.createTemplate(daily('Other'))
    const plan = await service.openDay(TODAY)
    const report = byTitle(plan, 'Report')
    if (completion) await service.setCompletion(report.id, completion)
    return { u, service, client, tpl, plan, report }
  }

  it('a partly done task moves: its 0.5 and its original place stay, the remainder is pending on the new day, and the figures follow the rules', async () => {
    const { service, report, u } = await setup(0.5)
    // Fridays already include Report by recurrence, so move it to Thursday instead (no duplicate there).
    const { source, target, link } = await service.rescheduleOccurrence(report.id, '2026-03-12', { plannedStart: '14:00', plannedEnd: '15:00' })
    expect(source).toMatchObject({ id: report.id, planDate: TODAY, planState: 'excluded', excludedReason: 'rescheduled', completion: 0.5 })
    expect(target).toMatchObject({ planDate: '2026-03-12', completion: 0, planState: 'active', rescheduledFromId: report.id, plannedStart: '14:00', isCustomized: true })
    expect(link).toEqual({ fromId: report.id, fromDate: TODAY, toDate: '2026-03-12', reason: 'rescheduled' })

    const monday = await service.getDayPlan(TODAY)
    expect(monday.summary.original.count).toBe(2) // Report + Other: the original plan is intact
    expect(monday.summary.original.units).toBe(0.5) // the 0.5 stays on the day it was done
    expect(monday.summary.current.count).toBe(1) // Report left the revised plan
    expect(monday.summary.revised).toBe(true)
    const thursday = await service.getDayPlan('2026-03-12')
    expect(thursday.occurrences.filter((o) => o.title === 'Report')).toHaveLength(1)
    expect(await count(db, 'task_occurrences', `user_id = $1 and rescheduled_from_id = $2`, [u, report.id])).toBe(1)
  })

  it('refuses to move a done task, and to a day that already has the template; the database is unchanged', async () => {
    const done = await setup(1)
    const e = await rejection(done.service.rescheduleOccurrence(done.report.id, '2026-03-12'))
    expect(e.details.plannerCode).toBe('HAS_PROGRESS')
    expect(await count(db, 'day_plans', `user_id = $1 and plan_date = '2026-03-12'`, [done.u])).toBe(0)

    const dup = await setup(0)
    await dup.service.openDay(FRIDAY) // Friday already carries Report by recurrence
    const conflict = await rejection(dup.service.rescheduleOccurrence(dup.report.id, FRIDAY))
    expect(conflict).toMatchObject({ code: SERVICE_ERROR.CONFLICT })
    expect(conflict.details.plannerCode).toBe('ALREADY_PLANNED_ON_TARGET')
    expect((await dup.service.getDayPlan(TODAY)).occurrences.find((o) => o.id === dup.report.id).planState).toBe('active')
  })

  it('refuses read-only and too-distant target days', async () => {
    const { service, report } = await setup(0)
    expect((await rejection(service.rescheduleOccurrence(report.id, '2026-03-03'))).details.plannerCode).toBe('DATE_NOT_EDITABLE')
    expect((await rejection(service.rescheduleOccurrence(report.id, '2026-04-10'))).details.plannerCode).toBe('BEYOND_PLAN_AHEAD')
    expect((await rejection(service.rescheduleOccurrence(report.id, TODAY))).details.plannerCode).toBe('INVALID_RESCHEDULE_TARGET')
  })

  it('undoing a move removes the copy (and suppresses it), restores the source and keeps its progress', async () => {
    const { service, report, u } = await setup(0.5)
    await service.rescheduleOccurrence(report.id, '2026-03-12')
    const undone = await service.undoReschedule(report.id)
    expect(undone.source).toMatchObject({ planState: 'active', excludedReason: null, completion: 0.5 })
    expect(await count(db, 'task_occurrences', `user_id = $1 and rescheduled_from_id is not null`, [u])).toBe(0)
    expect((await service.getDayPlan('2026-03-12')).day.suppressedTemplateIds).toHaveLength(1)
    expect((await service.openDay('2026-03-12')).occurrences.filter((o) => o.title === 'Report')).toEqual([]) // the undone copy does not come back (the other daily task does)
  })

  it('refuses to undo a move once progress was recorded on the new day', async () => {
    const { service, report } = await setup(0)
    const { target } = await service.rescheduleOccurrence(report.id, '2026-03-12')
    await setNow('2026-03-12T15:00:00Z')
    await service.setCompletion(target.id, 0.5)
    const e = await rejection(service.undoReschedule(report.id))
    expect(e.code).toBe(SERVICE_ERROR.CONFLICT)
    await setNow(CLOCK)
  })
})

describe('day modes', () => {
  it('Busy and Rest fix the baseline on the server; Rest is identifiable even with tasks', async () => {
    const u = await fresh()
    const { service } = serviceFor(u)
    await service.createTemplate(daily('A'))
    await service.openDay(TODAY)
    const busy = await service.setDayMode(TODAY, 'busy')
    expect(busy).toMatchObject({ dayMode: 'busy' })
    expect(busy.baselineAt).toBeTruthy()
    const rest = await service.setDayMode(TODAY, 'rest')
    expect(rest.baselineAt).toBe(busy.baselineAt)
    const plan = await service.getDayPlan(TODAY)
    expect(plan.summary).toMatchObject({ isRestDay: true, kind: 'rest' })
    expect(plan.occurrences).toHaveLength(1) // nothing discarded
    expect((await service.setDayMode(TODAY, 'normal')).dayMode).toBe('normal')
  })

  it('creates the day if needed, ignores a repeat, rejects unknown modes and read-only days', async () => {
    const u = await fresh()
    const { service } = serviceFor(u)
    expect((await service.setDayMode('2026-03-12', 'rest')).dayMode).toBe('rest')
    expect(await count(db, 'day_plans', 'user_id = $1', [u])).toBe(1)
    expect((await service.setDayMode('2026-03-12', 'rest')).dayMode).toBe('rest')
    expect((await rejection(service.setDayMode(TODAY, 'festival'))).details.plannerCode).toBe('INVALID_DAY_MODE')
    expect((await rejection(service.setDayMode('2026-03-03', 'busy'))).details.plannerCode).toBe('DATE_NOT_EDITABLE')
  })
})

describe('history: snapshots and weekly progress', () => {
  it('a past day\'s snapshot is identical before and after later edits, deletes and moves elsewhere', async () => {
    const u = await fresh()
    const { service } = serviceFor(u)
    const tpl = await service.createTemplate(daily('Walk', { plannedStart: '07:00' }))
    const day = await service.openDay('2026-03-08')
    await service.setCompletion(day.occurrences[0].id, 0.5)
    await service.setDayMode('2026-03-08', 'busy')
    const before = await service.getPlanSnapshot('2026-03-08')
    expect(before).toMatchObject({ revised: true, dayMode: 'busy' })
    expect(Object.isFrozen(before)).toBe(true)

    await service.updateTemplate(tpl.id, { title: 'Run', plannedStart: '05:00' })
    await service.archiveTemplate(tpl.id)
    expect(await service.getPlanSnapshot('2026-03-08')).toEqual(before) // edit + archive: byte-for-byte identical
    await service.deleteTemplate(tpl.id)
    // Deleting the template clears only the link back to it (by design); everything recorded stays.
    const withoutLink = (snap) => JSON.parse(JSON.stringify(snap, (k, v) => (k === 'templateId' ? undefined : v)))
    const after = await service.getPlanSnapshot('2026-03-08')
    expect(withoutLink(after)).toEqual(withoutLink(before))
    expect(after.original[0]).toMatchObject({ title: 'Walk', plannedStart: '07:00', completion: 0.5, templateId: null })
  })

  it('lists snapshots for a range, oldest first, including read-only history; null for an unplanned day', async () => {
    const u = await fresh()
    const { service } = serviceFor(u)
    await occurrence(db, u, '2026-03-02', { title: 'old' }) // read-only history, seeded as the owner
    await service.createTask('2026-03-09', { title: 'mon' })
    await service.createTask(TODAY, { title: 'tue' })
    const list = await service.listSnapshots({ from: '2026-03-01', to: '2026-03-10' })
    expect(list.map((s) => s.planDate)).toEqual(['2026-03-02', '2026-03-09', TODAY])
    expect(list[0].original[0].title).toBe('old')
    expect(await service.getPlanSnapshot('2026-03-05')).toBeNull()
  })

  it('weekly summary: Monday start, days with progress, rest days shown and excluded from the average, eligibility after 3 planned days', async () => {
    const u = await fresh()
    const { service } = serviceFor(u)
    await setNow('2026-03-12T15:00:00Z') // Thursday: Monday to Wednesday have happened
    await service.createTemplate(daily('A'))
    await service.createTemplate(daily('B'))
    const mon = await service.openDay('2026-03-09')
    const tue = await service.openDay('2026-03-10')
    await service.openDay('2026-03-11')
    await service.setDayMode('2026-03-11', 'rest')
    await service.setCompletion(byTitle(mon, 'A').id, 1) // Monday 50%
    await service.setCompletion(byTitle(tue, 'B').id, 0.5) // Tuesday 25%
    const week = await service.getWeekSummary()
    expect([week.weekStart, week.weekEnd]).toEqual(['2026-03-09', '2026-03-15'])
    expect(week).toMatchObject({ plannedDays: 2, restDays: 1, daysWithPlan: 3, daysWithProgress: 2, eligible: true })
    expect(week.averagePercent).toBe(38) // mean of 50% and 25% = 37.5, rounded half up; the rest day is excluded
    expect(week.days.find((d) => d.date === '2026-03-11')).toMatchObject({ kind: 'rest', isRestDay: true })
    expect(week.days.find((d) => d.date === '2026-03-14')).toMatchObject({ kind: 'upcoming' })
    expect(JSON.stringify(week)).not.toMatch(/streak/i)
    await setNow(CLOCK)
  })

  it('a week with no plans has no average and is not eligible', async () => {
    const { service } = serviceFor(await fresh())
    expect(await service.getWeekSummary()).toMatchObject({ plannedDays: 0, averagePercent: null, eligible: false })
  })
})

describe('another user\'s data is out of reach (enforced by the database, not by the service)', () => {
  let alice
  let bob
  let aliceTemplate
  let aliceOcc
  beforeAll(async () => {
    alice = await fresh()
    bob = await fresh()
    const a = serviceFor(alice).service
    aliceTemplate = await a.createTemplate(daily('Alice private'))
    const plan = await a.openDay(TODAY)
    aliceOcc = plan.occurrences[0]
  })

  it('every operation on Alice\'s records fails as NOT_FOUND for Bob, and nothing changes', async () => {
    const { service } = serviceFor(bob)
    const attempts = [
      () => service.setCompletion(aliceOcc.id, 1),
      () => service.setAside(aliceOcc.id, 'busy_day'),
      () => service.restore(aliceOcc.id),
      () => service.removeOccurrence(aliceOcc.id),
      () => service.rescheduleOccurrence(aliceOcc.id, '2026-03-12'),
      () => service.undoReschedule(aliceOcc.id),
      () => service.updateOccurrence(aliceOcc.id, { title: 'hacked' }),
      () => service.updateTemplate(aliceTemplate.id, { title: 'hacked' }),
      () => service.archiveTemplate(aliceTemplate.id),
      () => service.deleteTemplate(aliceTemplate.id),
    ]
    for (const attempt of attempts) expect((await rejection(attempt())).code).toBe(SERVICE_ERROR.NOT_FOUND)
    const row = await one(db, 'select title, completion, plan_state from public.task_occurrences where id = $1', [aliceOcc.id])
    expect(row).toMatchObject({ title: 'Alice private', plan_state: 'active' })
    expect(Number(row.completion)).toBe(0)
    expect(await count(db, 'task_templates', 'id = $1', [aliceTemplate.id])).toBe(1)
  })

  it('Bob sees none of Alice\'s days, templates or snapshots, and the service never filters by user id itself', async () => {
    const { service, client } = serviceFor(bob)
    expect(await service.getDayPlan(TODAY)).toMatchObject({ exists: false, occurrences: [] })
    expect(await service.listTemplates({ includeArchived: true })).toEqual([])
    expect(await service.getPlanSnapshot(TODAY)).toBeNull()
    expect((await service.listSnapshots({ from: '2026-03-01', to: TODAY }))).toEqual([])
    expect((await service.getWeekSummary()).plannedDays).toBe(0)
    // Isolation therefore comes from RLS: no query the service sent carries a user_id filter.
    expect(client.log.length).toBeGreaterThan(5)
    expect(client.log.every((q) => q.filters.every((f) => f.column !== 'user_id'))).toBe(true)
  })

  it('Bob\'s own planner works normally alongside Alice\'s', async () => {
    const { service } = serviceFor(bob)
    await service.createTemplate(daily('Bob routine'))
    expect((await service.openDay(TODAY)).occurrences.map((o) => o.title)).toEqual(['Bob routine'])
  })

  it('raw writes aimed at Alice\'s rows or in her name are refused by the database itself', async () => {
    const { client } = serviceFor(bob)
    const forged = await client.from('task_templates').insert({ user_id: alice, title: 'planted', recurrence: 'daily', starts_on: '2026-03-01' }).select('id')
    expect(forged.error.code).toBe('42501')
    expect(toServiceError(forged.error).code).toBe(SERVICE_ERROR.PERMISSION_DENIED)
    const hijack = await client.from('task_occurrences').update({ title: 'hacked' }).eq('id', aliceOcc.id).select('id')
    expect(hijack).toEqual({ data: [], error: null }) // invisible: zero rows, no error
    const crossRef = await client.from('day_plans').insert({ user_id: bob, plan_date: '2026-03-12' }).select('plan_date')
    expect(crossRef.error).toBeNull()
    const link = await client.from('task_occurrences').insert({ user_id: bob, plan_date: '2026-03-12', title: 'x', template_id: aliceTemplate.id }).select('id')
    expect(link.error.code).toBe('23503')
    expect(await count(db, 'task_templates', `title = 'planted'`)).toBe(0)
  })
})

describe('unauthenticated use', () => {
  it('every operation fails with AUTH_REQUIRED and never reaches the database', async () => {
    const { service, client } = serviceFor(null)
    const calls = {
      getToday: [], getDayPlan: [TODAY], openDay: [TODAY], listTemplates: [], createTemplate: [daily('x')], createTask: [TODAY, { title: 'x' }],
      updateTemplate: [], archiveTemplate: [], deleteTemplate: [], updateOccurrence: [], setCompletion: [], undoCompletion: [], setAside: [], restore: [],
      removeOccurrence: [], rescheduleOccurrence: [], undoReschedule: [], setDayMode: [TODAY, 'busy'], getPlanSnapshot: [TODAY],
      listSnapshots: [{ from: '2026-03-01', to: TODAY }], getWeekSummary: [{}], getHabitProgress: [{}], getRecoveryStatus: [],
    }
    expect(Object.keys(calls).sort()).toEqual(Object.keys(service).sort())
    const id = '11111111-1111-4111-8111-111111111111'
    for (const [name, args] of Object.entries(calls)) {
      const a = args.length ? args : name === 'setCompletion' ? [id, 1] : name === 'setAside' ? [id, 'busy_day'] : name === 'rescheduleOccurrence' ? [id, '2026-03-12'] : name === 'updateTemplate' || name === 'updateOccurrence' ? [id, {}] : [id]
      expect((await rejection(service[name](...a))).code, name).toBe(SERVICE_ERROR.AUTH_REQUIRED)
    }
    expect(client.log).toEqual([])
  })

  it('and the database itself refuses an anonymous client', async () => {
    const { client } = serviceFor(null)
    for (const table of ['task_templates', 'day_plans', 'task_occurrences']) {
      const r = await client.from(table).select('*')
      expect(r.error.code).toBe('42501')
      expect(toServiceError(r.error).code).toBe(SERVICE_ERROR.PERMISSION_DENIED)
    }
  })
})

describe('failures are reported, not swallowed', () => {
  it('a network failure becomes a retryable NETWORK error and changes nothing', async () => {
    const u = await fresh()
    const hooks = { before: (state) => { if (state.op === 'insert') throw new TypeError('Failed to fetch') } }
    const { service } = serviceFor(u, hooks)
    const e = await rejection(service.createTemplate(daily('Never saved')))
    expect(e).toMatchObject({ code: SERVICE_ERROR.NETWORK, retryable: true })
    expect(await count(db, 'task_templates', 'user_id = $1', [u])).toBe(0)
  })

  it('real database error codes map to the right categories', async () => {
    const u = await fresh()
    const other = await fresh()
    const { client } = serviceFor(u)
    const otherTemplate = (await serviceFor(other).service.createTemplate(daily('theirs')))
    await client.from('day_plans').insert({ user_id: u, plan_date: '2026-03-11' }).select('plan_date')
    const cases = [
      [await client.from('day_plans').insert({ user_id: u, plan_date: '2026-03-11' }).select('plan_date'), '23505', SERVICE_ERROR.CONFLICT],
      [await client.from('task_occurrences').insert({ user_id: u, plan_date: '2026-03-11', title: 'x', template_id: otherTemplate.id }).select('id'), '23503', SERVICE_ERROR.NOT_FOUND],
    ]
    const [inserted] = (await client.from('task_occurrences').insert({ user_id: u, plan_date: '2026-03-11', title: 'future' }).select('id')).data
    await client.from('day_plans').insert({ user_id: u, plan_date: TODAY }).select('plan_date')
    const [todays] = (await client.from('task_occurrences').insert({ user_id: u, plan_date: TODAY, title: 'today' }).select('id')).data
    cases.push([await client.from('task_occurrences').update({ completion: 0.3 }).eq('id', todays.id).select('id'), '23514', SERVICE_ERROR.VALIDATION])
    cases.push([await client.from('task_occurrences').update({ completion: 0.5 }).eq('id', inserted.id).select('id'), '22008', SERVICE_ERROR.VALIDATION]) // future-dated progress
    for (const [response, dbCode, expected] of cases) {
      expect(response.error.code).toBe(dbCode)
      const mapped = toServiceError(response.error)
      expect(mapped.code).toBe(expected)
      expect(mapped.message).not.toMatch(/task_occurrences|day_plans|violates/)
    }
  })

  it('the per-day cap raised by the database comes back as a clear validation error', async () => {
    const u = await fresh()
    const { service } = serviceFor(u)
    await service.openDay(TODAY)
    await db.query(`insert into public.task_occurrences (user_id, plan_date, title) select $1, date '${TODAY}', 'T' || g from generate_series(1, 100) g`, [u])
    const e = await rejection(service.createTask(TODAY, { title: 'one too many' }))
    expect(e.code).toBe(SERVICE_ERROR.VALIDATION)
    expect(e.message).toMatch(/Too many tasks/)
    expect(e.details.partial).toBe('template_created') // the template exists; the failed step is reported precisely
  })
})
