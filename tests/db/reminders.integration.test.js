import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createPlannerService } from '../../src/services/planner/createPlannerService.js'
import { createReminderService } from '../../src/services/reminders/createReminderService.js'
import { SERVICE_ERROR } from '../../src/services/planner/errors.js'
import { createPgliteClient } from '../support/pgliteSupabase.js'
import { asUser, createDb, createUser, useFixedClock } from './harness.js'
import { CLOCK, TODAY, count, occurrence, one, rejects } from './plannerSeed.js'

// Reminder tables and the reminder service against the real migration in PGlite (constraints,
// triggers, column grants and RLS apply). Not PostgREST, not a real Supabase project, and not a
// browser: delivery in the open app is covered by the UI tests.
let db
let seq = 0
beforeAll(async () => {
  db = await createDb()
  await useFixedClock(db, CLOCK) // Tuesday 2026-03-10 11:00 in New York
}, 60000)
afterAll(async () => {
  await db?.close()
})

let user
beforeEach(async () => {
  user = await createUser(db, `rem-${(seq += 1)}@example.com`, 'America/New_York')
})

const servicesFor = (userId, nowIso = CLOCK) => {
  const client = createPgliteClient(db, { getUserId: () => userId })
  const clock = () => Date.parse(nowIso)
  return { planner: createPlannerService({ getClient: () => client, clock }), reminders: createReminderService({ getClient: () => client, clock }) }
}
const code = async (promise) => {
  try {
    await promise
  } catch (e) {
    return e.code
  }
  return null
}
const sql = (userId, text, params = []) => asUser(db, userId, (d) => d.query(text, params))

describe('reminder tables: constraints, grants and RLS', () => {
  it('rejects invalid weekdays, a second row per user and times with seconds', async () => {
    const bad = (days) => sql(user, 'insert into public.reminder_preferences (user_id, weekdays) values ($1, $2)', [user, days])
    await rejects(bad('{}'), /reminder_preferences_weekdays_valid/)
    await rejects(bad('{1,1}'), /reminder_preferences_weekdays_valid/)
    await rejects(bad('{8}'), /reminder_preferences_weekdays_valid/)
    await rejects(sql(user, `insert into public.reminder_preferences (user_id, remind_time) values ($1, '09:00:30')`, [user]), /time_whole_minutes/)
    await sql(user, 'insert into public.reminder_preferences (user_id) values ($1)', [user])
    await rejects(sql(user, 'insert into public.reminder_preferences (user_id) values ($1)', [user]), /duplicate key|primary key/)
    const row = (await sql(user, 'select * from public.reminder_preferences')).rows[0]
    expect(row).toMatchObject({ enabled: false, weekdays: [1, 2, 3, 4, 5, 6, 7] }) // off by default
  })

  it('keeps preferences private to their owner', async () => {
    const other = await createUser(db, `rem-other-${(seq += 1)}@example.com`)
    await sql(user, 'insert into public.reminder_preferences (user_id, enabled) values ($1, true)', [user])
    expect((await sql(other, 'select * from public.reminder_preferences')).rows).toHaveLength(0)
    await rejects(sql(other, 'insert into public.reminder_preferences (user_id) values ($1)', [user]), /row-level security/)
    expect((await sql(other, 'update public.reminder_preferences set enabled = false returning 1')).rows).toHaveLength(0)
    expect((await sql(other, 'delete from public.reminder_preferences returning 1')).rows).toHaveLength(0)
    expect(await one(db, 'select enabled from public.reminder_preferences where user_id = $1', [user])).toEqual({ enabled: true })
    await rejects(sql(user, 'update public.reminder_preferences set user_id = $1', [other]), /permission denied/)
    await rejects(sql((await createUser(db, `anon-${(seq += 1)}@example.com`)), 'select 1 from public.reminder_preferences, auth.users'), /permission denied/)
  })

  it('task reminders: server-set date, one per task, private, and removed with the task', async () => {
    const other = await createUser(db, `rem-other-${(seq += 1)}@example.com`)
    const occ = await occurrence(db, user, TODAY)
    const theirs = await occurrence(db, other, TODAY)
    await rejects(sql(user, `insert into public.task_reminders (user_id, occurrence_id, remind_time, plan_date) values ($1, $2, '15:00', '2030-01-01')`, [user, occ.id]), /permission denied/)
    await sql(user, `insert into public.task_reminders (user_id, occurrence_id, remind_time) values ($1, $2, '15:00')`, [user, occ.id])
    const row = (await sql(user, 'select * from public.task_reminders')).rows[0]
    expect(row.plan_date.toISOString?.().slice(0, 10) ?? row.plan_date).toBe(TODAY)
    expect(row.notified_at).toBeNull()
    await rejects(sql(user, `insert into public.task_reminders (user_id, occurrence_id, remind_time) values ($1, $2, '16:00')`, [user, occ.id]), /task_reminders_occurrence_key|duplicate/)
    // Another user's task: not visible, not attachable.
    await rejects(sql(user, `insert into public.task_reminders (user_id, occurrence_id, remind_time) values ($1, $2, '16:00')`, [user, theirs.id]), /foreign key|violates/)
    expect((await sql(other, 'select * from public.task_reminders')).rows).toHaveLength(0)
    // Changing the time makes the reminder deliverable again.
    await sql(user, `update public.task_reminders set notified_at = now() where occurrence_id = $1`, [occ.id])
    expect((await sql(user, 'select notified_at from public.task_reminders')).rows[0].notified_at).not.toBeNull()
    await sql(user, `update public.task_reminders set remind_time = '16:30' where occurrence_id = $1`, [occ.id])
    expect((await sql(user, 'select notified_at from public.task_reminders')).rows[0].notified_at).toBeNull()
    // The reminder goes with its task.
    await db.query('delete from public.task_occurrences where id = $1', [occ.id])
    expect(await count(db, 'task_reminders', 'user_id = $1', [user])).toBe(0)
  })
})

describe('reminder service', () => {
  it('starts with reminders off and creates nothing for the user', async () => {
    const { planner, reminders } = servicesFor(user)
    expect(await reminders.getPreferences()).toMatchObject({ exists: false, enabled: false, remindTime: '09:00', weekdays: [1, 2, 3, 4, 5, 6, 7] })
    await planner.createTemplate({ title: 'Walk', recurrence: 'daily', startsOn: '2026-03-01' })
    await planner.openDay(TODAY)
    expect(await reminders.listTaskReminders()).toEqual([])
    expect(await count(db, 'reminder_preferences', 'user_id = $1', [user])).toBe(0)
  })

  it('saves, changes, and resets preferences; invalid input is rejected without saving', async () => {
    const { reminders } = servicesFor(user)
    const saved = await reminders.savePreferences({ enabled: true, remindTime: '07:30', weekdays: [5, 1, 3, 1] })
    expect(saved).toMatchObject({ exists: true, enabled: true, remindTime: '07:30', weekdays: [1, 3, 5] })
    expect(await reminders.getPreferences()).toMatchObject({ enabled: true, remindTime: '07:30', weekdays: [1, 3, 5] })
    expect(await reminders.savePreferences({ enabled: false, remindTime: '07:30', weekdays: [1, 3, 5] })).toMatchObject({ enabled: false })
    for (const input of [{ enabled: true, remindTime: '25:00', weekdays: [1] }, { enabled: true, remindTime: '09:00', weekdays: [] }, { enabled: 'yes', remindTime: '09:00', weekdays: [1] }, { enabled: true, remindTime: '09:00:15', weekdays: [1] }, null]) {
      expect(await code(reminders.savePreferences(input))).toBe(SERVICE_ERROR.VALIDATION)
    }
    expect((await reminders.getPreferences()).enabled).toBe(false)
    expect(await reminders.resetPreferences()).toMatchObject({ exists: false, enabled: false, remindTime: '09:00' })
    expect(await count(db, 'reminder_preferences', 'user_id = $1', [user])).toBe(0)
    await reminders.resetPreferences() // resetting twice is harmless
  })

  it('never delivers the same daily reminder twice, even from two tabs at once', async () => {
    const { reminders } = servicesFor(user)
    await reminders.savePreferences({ enabled: true, remindTime: '12:00', weekdays: [1, 2, 3, 4, 5, 6, 7] }) // later than the 11:00 clock
    const results = await Promise.all([reminders.claimDailyReminder(TODAY), reminders.claimDailyReminder(TODAY)])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(await reminders.claimDailyReminder(TODAY)).toBe(false)
    expect(await reminders.claimDailyReminder('2026-03-11')).toBe(true) // the next day is a new reminder
  })

  it('does not fire straight away when reminders are turned on after the time has passed', async () => {
    const { reminders } = servicesFor(user)
    await reminders.savePreferences({ enabled: true, remindTime: '09:00', weekdays: [1, 2, 3, 4, 5, 6, 7] }) // 09:00 < 11:00 now
    expect((await reminders.getPreferences()).lastNotifiedOn).toBe(TODAY)
    expect(await reminders.claimDailyReminder(TODAY)).toBe(false)
  })

  it('uses the profile timezone for "today"', async () => {
    const nz = await createUser(db, `nz-${(seq += 1)}@example.com`, 'Pacific/Auckland')
    const { reminders } = servicesFor(nz) // 15:00Z is 04:00 on 11 March in Auckland
    expect(await reminders.getContext()).toMatchObject({ today: '2026-03-11', timeZone: 'Pacific/Auckland' })
    // 05:00 local has not happened yet in Auckland, so turning on a 05:00 reminder keeps it for today.
    await reminders.savePreferences({ enabled: true, remindTime: '05:00', weekdays: [1, 2, 3, 4, 5, 6, 7] })
    expect((await reminders.getPreferences()).lastNotifiedOn).toBe('1970-01-01')
    expect(await reminders.claimDailyReminder('2026-03-11')).toBe(true)
  })

  it('sets, changes and removes a reminder on one task only', async () => {
    const { planner, reminders } = servicesFor(user)
    const { plan } = await planner.createTask(TODAY, { title: 'Call mum' })
    await planner.createTask(TODAY, { title: 'Read' })
    const [call] = plan.occurrences.filter((o) => o.title === 'Call mum')
    const set = await reminders.setTaskReminder(call.id, '15:00')
    expect(set).toMatchObject({ occurrenceId: call.id, planDate: TODAY, remindTime: '15:00', notifiedAt: null })
    expect(await reminders.listTaskReminders()).toEqual([expect.objectContaining({ title: 'Call mum', remindTime: '15:00', planState: 'active', completion: 0 })])
    // Delivered once; a new time is a new schedule.
    expect(await reminders.claimTaskReminder(set.id)).toBe(true)
    expect(await reminders.claimTaskReminder(set.id)).toBe(false)
    const moved = await reminders.setTaskReminder(call.id, '16:00')
    expect(moved).toMatchObject({ id: set.id, remindTime: '16:00', notifiedAt: null })
    expect(await reminders.claimTaskReminder(set.id)).toBe(true)
    expect(await reminders.removeTaskReminder(call.id)).toEqual({ removed: true })
    expect(await reminders.removeTaskReminder(call.id)).toEqual({ removed: false })
    expect(await reminders.listTaskReminders()).toEqual([])
  })

  it('only allows reminders for open tasks, in the future, and in the user\'s own plan', async () => {
    const { planner, reminders } = servicesFor(user)
    const { plan } = await planner.createTask(TODAY, { title: 'Walk' })
    const walk = plan.occurrences[0]
    expect(await code(reminders.setTaskReminder(walk.id, '10:00'))).toBe(SERVICE_ERROR.VALIDATION) // 10:00 has passed (11:00 now)
    expect(await code(reminders.setTaskReminder(walk.id, '9am'))).toBe(SERVICE_ERROR.VALIDATION)
    expect(await code(reminders.setTaskReminder('not-an-id', '15:00'))).toBe(SERVICE_ERROR.VALIDATION)
    const yesterday = await planner.createTask('2026-03-09', { title: 'Old' })
    expect(await code(reminders.setTaskReminder(yesterday.plan.occurrences[0].id, '15:00'))).toBe(SERVICE_ERROR.VALIDATION)
    await planner.setCompletion(walk.id, 1)
    expect(await code(reminders.setTaskReminder(walk.id, '15:00'))).toBe(SERVICE_ERROR.CONFLICT)
    await planner.setCompletion(walk.id, 0)
    await planner.setAside(walk.id, 'busy_day')
    expect(await code(reminders.setTaskReminder(walk.id, '15:00'))).toBe(SERVICE_ERROR.CONFLICT)
    await planner.restore(walk.id)
    const other = await createUser(db, `rem-other-${(seq += 1)}@example.com`, 'America/New_York')
    expect(await code(servicesFor(other).reminders.setTaskReminder(walk.id, '15:00'))).toBe(SERVICE_ERROR.NOT_FOUND)
    expect(await count(db, 'task_reminders', 'user_id = $1', [user])).toBe(0)
  })

  it('lists reminders by date range and drops them with a removed task', async () => {
    const { planner, reminders } = servicesFor(user)
    const a = (await planner.createTask(TODAY, { title: 'Today task' })).plan.occurrences[0]
    const b = (await planner.createTask('2026-03-12', { title: 'Thursday task' })).plan.occurrences[0]
    await reminders.setTaskReminder(a.id, '18:00')
    await reminders.setTaskReminder(b.id, '08:00')
    expect((await reminders.listTaskReminders()).map((r) => r.title)).toEqual(['Today task', 'Thursday task'])
    expect((await reminders.listTaskReminders({ from: '2026-03-12', to: '2026-03-12' })).map((r) => r.title)).toEqual(['Thursday task'])
    expect(await code(reminders.listTaskReminders({ from: 'x' }))).toBe(SERVICE_ERROR.VALIDATION)
    await planner.removeOccurrence(b.id) // untouched task: deleted, and the reminder with it
    expect((await reminders.listTaskReminders()).map((r) => r.title)).toEqual(['Today task'])
  })

  it('requires a signed-in user and shows only the user\'s own reminders', async () => {
    const signedOut = createReminderService({ getClient: () => createPgliteClient(db, { getUserId: () => null }), clock: () => Date.parse(CLOCK) })
    expect([SERVICE_ERROR.AUTH_REQUIRED, SERVICE_ERROR.NOT_FOUND]).toContain(await code(signedOut.getPreferences()))
    const { planner, reminders } = servicesFor(user)
    const t = (await planner.createTask(TODAY, { title: 'Private' })).plan.occurrences[0]
    await reminders.setTaskReminder(t.id, '15:00')
    const other = await createUser(db, `rem-other-${(seq += 1)}@example.com`)
    expect(await servicesFor(other).reminders.listTaskReminders()).toEqual([])
    expect(await servicesFor(other).reminders.claimTaskReminder((await reminders.listTaskReminders())[0].id)).toBe(false)
  })
})
