import { PlannerServiceError, SERVICE_ERROR, toServiceError } from '../planner/errors.js'
import {
  REMINDER_DEFAULTS,
  addDays,
  compareDates,
  isValidDate,
  reminderInstant,
  resolveContext,
  validateReminderPreferences,
  validateReminderTime,
} from '../../utils/planner/index.js'

// Reminder preferences and per-task reminders. Like the planner service: the database (RLS) is the
// security boundary, the signed-in user comes from the Supabase session, input is validated with the
// pure logic before any write, and every failure is a PlannerServiceError.
//
// This service only stores and reads reminders and records that one was delivered. It does not
// schedule or deliver anything; the open app does that (see useReminderScheduler).
const fail = (code, message, details = {}) => new PlannerServiceError(code, message, { details })
const check = (response) => {
  if (response.error) throw toServiceError(response.error)
  return response.data
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const assertId = (value) => {
  if (typeof value !== 'string' || !UUID.test(value)) throw fail(SERVICE_ERROR.VALIDATION, 'That reference is not valid.')
}

const PREF_COLUMNS = 'enabled, remind_time, weekdays, last_notified_on'
const REMINDER_COLUMNS = 'id, occurrence_id, plan_date, remind_time, notified_at'
const AHEAD_DAYS = 30

const hhmm = (time) => String(time).slice(0, 5)
const prefsFromRow = (row) => ({
  exists: true,
  enabled: row.enabled,
  remindTime: hhmm(row.remind_time),
  weekdays: [...row.weekdays].sort((a, b) => a - b),
  lastNotifiedOn: row.last_notified_on,
})
const DEFAULT_PREFS = { exists: false, ...REMINDER_DEFAULTS, weekdays: [...REMINDER_DEFAULTS.weekdays] }
const reminderFromRow = (row) => ({
  id: row.id,
  occurrenceId: row.occurrence_id,
  planDate: row.plan_date,
  remindTime: hhmm(row.remind_time),
  notifiedAt: row.notified_at ?? null,
})

export function createReminderService({ getClient, clock = () => Date.now() }) {
  async function session() {
    const client = getClient()
    if (!client) throw fail(SERVICE_ERROR.NOT_CONFIGURED, 'Reminders are not available right now.')
    const auth = await client.auth.getSession()
    if (auth.error) throw toServiceError(auth.error)
    const userId = auth.data?.session?.user?.id
    if (!userId) throw fail(SERVICE_ERROR.AUTH_REQUIRED, 'Please log in to continue.')
    const profile = check(await client.from('profiles').select('timezone').eq('id', userId).maybeSingle())
    if (!profile) throw fail(SERVICE_ERROR.NOT_FOUND, 'Your profile could not be found.')
    const ctx = resolveContext({ now: clock(), timeZone: profile.timezone })
    return { client, userId, ctx }
  }

  async function readPreferences(client) {
    const row = check(await client.from('reminder_preferences').select(PREF_COLUMNS).maybeSingle())
    return row ? prefsFromRow(row) : { ...DEFAULT_PREFS, weekdays: [...DEFAULT_PREFS.weekdays] }
  }

  // Joins the reminders with the tasks they belong to (title, state) in a second query.
  async function withTasks(client, reminderRows) {
    if (reminderRows.length === 0) return []
    const ids = reminderRows.map((r) => r.occurrence_id)
    const tasks = check(await client.from('task_occurrences').select('id, title, completion, plan_state').in('id', ids)) ?? []
    const byId = new Map(tasks.map((t) => [t.id, t]))
    return reminderRows
      .filter((r) => byId.has(r.occurrence_id))
      .map((r) => {
        const t = byId.get(r.occurrence_id)
        return { ...reminderFromRow(r), title: t.title, completion: Number(t.completion), planState: t.plan_state }
      })
  }

  const ops = {
    // The user's current local date and timezone, for deciding what is due.
    async getContext() {
      const { ctx } = await session()
      return { today: ctx.today, timeZone: ctx.timeZone, now: ctx.nowMs }
    },

    // Defaults (reminders off) when the user has never saved settings.
    async getPreferences() {
      const { client } = await session()
      return readPreferences(client)
    },

    async savePreferences(input) {
      const checked = validateReminderPreferences(input)
      if (!checked.ok) throw fail(SERVICE_ERROR.VALIDATION, 'Please check the highlighted details.', { fields: checked.errors })
      const { client, userId, ctx } = await session()
      const existing = await readPreferences(client)
      const { enabled, remindTime, weekdays } = checked.value
      // Turning reminders on (or moving the time) after today's time has passed must not fire one
      // straight away: the first reminder is the next scheduled one.
      const passedToday = reminderInstant(ctx.today, remindTime, ctx.timeZone) <= ctx.nowMs
      const lastNotifiedOn = enabled && passedToday && compareDates(existing.lastNotifiedOn, ctx.today) < 0 ? ctx.today : existing.lastNotifiedOn
      const row = { enabled, remind_time: remindTime, weekdays, last_notified_on: lastNotifiedOn }
      const saved = existing.exists
        ? check(await client.from('reminder_preferences').update(row).eq('user_id', userId).select(PREF_COLUMNS))
        : check(await client.from('reminder_preferences').insert({ user_id: userId, ...row }).select(PREF_COLUMNS))
      if (!saved || saved.length !== 1) throw fail(SERVICE_ERROR.NOT_FOUND, 'Your reminder settings could not be saved.', { reason: 'no_rows_affected' })
      return prefsFromRow(saved[0])
    },

    // Back to the defaults: reminders off. Task reminders the user set are kept but are not delivered
    // while reminders are off.
    async resetPreferences() {
      const { client, userId } = await session()
      check(await client.from('reminder_preferences').delete().eq('user_id', userId).select('user_id'))
      return { ...DEFAULT_PREFS, weekdays: [...DEFAULT_PREFS.weekdays] }
    },

    // Records that the daily reminder for `date` was delivered. Returns true for the one caller that
    // recorded it; a second tab or a reload gets false and must not deliver it again.
    async claimDailyReminder(date) {
      if (!isValidDate(date)) throw fail(SERVICE_ERROR.VALIDATION, 'Choose a valid date.')
      const { client, userId } = await session()
      const rows = check(await client.from('reminder_preferences').update({ last_notified_on: date }).eq('user_id', userId).lt('last_notified_on', date).select('user_id'))
      return Array.isArray(rows) && rows.length === 1
    },

    // Reminders for tasks on dates from..to (default: today and the next 30 days), with task titles.
    async listTaskReminders({ from, to } = {}) {
      const { client, ctx } = await session()
      const start = from ?? ctx.today
      const end = to ?? addDays(ctx.today, AHEAD_DAYS)
      if (!isValidDate(start) || !isValidDate(end)) throw fail(SERVICE_ERROR.VALIDATION, 'Choose valid dates.')
      const rows = check(await client.from('task_reminders').select(REMINDER_COLUMNS).gte('plan_date', start).lte('plan_date', end).order('plan_date').order('remind_time').order('id')) ?? []
      return withTasks(client, rows)
    },

    // One reminder per task, set only when the user asks. Setting a new time replaces the old one and
    // makes it deliverable again.
    async setTaskReminder(occurrenceId, remindTime) {
      assertId(occurrenceId)
      const checked = validateReminderTime(remindTime)
      if (!checked.ok) throw fail(SERVICE_ERROR.VALIDATION, 'Please check the highlighted details.', { fields: checked.errors })
      const { client, userId, ctx } = await session()
      const task = check(await client.from('task_occurrences').select('id, plan_date, plan_state, completion').eq('id', occurrenceId).maybeSingle())
      if (!task) throw fail(SERVICE_ERROR.NOT_FOUND, 'That task could not be found.')
      if (compareDates(task.plan_date, ctx.today) < 0) throw fail(SERVICE_ERROR.VALIDATION, 'Reminders can be set for today or later.', { fields: { remindTime: 'Choose a task from today or later.' } })
      if (task.plan_state !== 'active' || Number(task.completion) >= 1) throw fail(SERVICE_ERROR.CONFLICT, 'Reminders are for tasks that are still open.')
      if (reminderInstant(task.plan_date, remindTime, ctx.timeZone) <= ctx.nowMs) {
        throw fail(SERVICE_ERROR.VALIDATION, 'That time has already passed. Choose a later time.', { fields: { remindTime: 'Choose a time that hasn’t passed yet.' } })
      }
      const existing = check(await client.from('task_reminders').select('id').eq('occurrence_id', occurrenceId).maybeSingle())
      const rows = existing
        ? check(await client.from('task_reminders').update({ remind_time: remindTime, notified_at: null }).eq('id', existing.id).select(REMINDER_COLUMNS))
        : check(await client.from('task_reminders').insert({ user_id: userId, occurrence_id: occurrenceId, remind_time: remindTime }).select(REMINDER_COLUMNS))
      if (!rows || rows.length !== 1) throw fail(SERVICE_ERROR.NOT_FOUND, 'The reminder could not be saved.', { reason: 'no_rows_affected' })
      return reminderFromRow(rows[0])
    },

    // Removing a reminder that is already gone is not an error.
    async removeTaskReminder(occurrenceId) {
      assertId(occurrenceId)
      const { client } = await session()
      const rows = check(await client.from('task_reminders').delete().eq('occurrence_id', occurrenceId).select('id')) ?? []
      return { removed: rows.length > 0 }
    },

    // Same contract as claimDailyReminder, for one task reminder.
    async claimTaskReminder(reminderId) {
      assertId(reminderId)
      const { client, ctx } = await session()
      const rows = check(await client.from('task_reminders').update({ notified_at: new Date(ctx.nowMs).toISOString() }).eq('id', reminderId).is('notified_at', null).select('id'))
      return Array.isArray(rows) && rows.length === 1
    },
  }
  return ops
}
