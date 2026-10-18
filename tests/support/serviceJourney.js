import { addDays } from '../../src/utils/planner/index.js'

// The core journey at the SERVICE level: the real service code and direct client calls, run by
// scripts/verify-django.mjs (`npm run verify:django`) against a real local Django server with real sign-in.
// It uses the real service code and direct client calls only; "today" always comes from the service, so it
// works at any real date and needs no clock tricks. It returns a list of { name, ok, detail } and never throws.
//
// a, b: { planner, reminders, client, userId } for two different signed-in users.
// anon: { client } with no session.  reopenA(): a fresh signed-in session for user A (sign out, sign in again).

const sanitize = (e) => String(e?.message ?? e).replace(/\s+/g, ' ').slice(0, 200)

function same(actual, expected, label) {
  const x = JSON.stringify(actual)
  const y = JSON.stringify(expected)
  if (x !== y) throw new Error(`${label}: expected ${y}, got ${x}`)
}
const truthy = (value, label) => {
  if (!value) throw new Error(`${label}: expected a truthy value, got ${JSON.stringify(value)}`)
}
const rejects = async (promise, label) => {
  try {
    await promise
  } catch {
    return
  }
  throw new Error(`${label}: expected this to be refused, but it succeeded`)
}
// A direct client call that must NOT succeed: either an error, or no rows affected/visible.
const blocked = async (promise, label) => {
  const { data, error } = await promise
  if (error) return
  if (Array.isArray(data) && data.length === 0) return
  throw new Error(`${label}: expected the database to refuse or return nothing, got ${JSON.stringify(data)}`)
}

export async function runServiceJourney({ a, b, anon, reopenA }) {
  const results = []
  const step = async (name, fn) => {
    try {
      const detail = await fn()
      results.push({ name, ok: true, detail: detail ?? '' })
    } catch (e) {
      results.push({ name, ok: false, detail: sanitize(e) })
    }
  }
  const ctx = {}
  const day = async (date) => (await a.planner.getDayPlan(date)).occurrences
  const byTitle = async (date, title) => (await day(date)).find((o) => o.title === title)

  await step('read the current local date from the service', async () => {
    const { today } = await a.planner.getToday()
    Object.assign(ctx, { today, tomorrow: addDays(today, 1), twoDaysAgo: addDays(today, -2) })
    truthy(/^\d{4}-\d{2}-\d{2}$/.test(today), 'today')
    return today
  })

  await step('create a recurring task and a one-off task', async () => {
    ctx.walk = await a.planner.createTemplate({ title: 'Verify walk', recurrence: 'daily', startsOn: addDays(ctx.today, -3) })
    await a.planner.createTask(ctx.today, { title: 'Verify one-off' })
    same((await day(ctx.today)).map((o) => o.title).sort(), ['Verify one-off', 'Verify walk'], 'today\'s plan')
  })

  await step('a planned day two days ago is created and left untouched', async () => {
    const plan = await a.planner.openDay(ctx.twoDaysAgo)
    same(plan.occurrences.map((o) => [o.title, o.completion]), [['Verify walk', 0]], 'two days ago')
  })

  await step('coming back is detected after an untouched planned day', async () => {
    const status = await a.planner.getRecoveryStatus()
    same(status.returning, true, 'returning')
    truthy(status.missedDates.includes(ctx.twoDaysAgo), 'missed dates include the untouched day')
  })

  await step('edit a task', async () => {
    const o = await byTitle(ctx.today, 'Verify one-off')
    await a.planner.updateOccurrence(o.id, { title: 'Verify one-off (edited)', estimatedMinutes: 30 })
    const after = await byTitle(ctx.today, 'Verify one-off (edited)')
    same([after.estimatedMinutes, after.isCustomized], [30, true], 'edited task')
  })

  await step('complete one task and partly complete another (75%)', async () => {
    await a.planner.setCompletion((await byTitle(ctx.today, 'Verify walk')).id, 1)
    await a.planner.setCompletion((await byTitle(ctx.today, 'Verify one-off (edited)')).id, 0.5)
    const plan = await a.planner.getDayPlan(ctx.today)
    same([plan.summary.current.percent, plan.summary.current.done, plan.summary.current.partial], [75, 1, 1], 'day progress')
  })

  await step('the "welcome back" condition clears once something is done today', async () => {
    same((await a.planner.getRecoveryStatus()).returning, false, 'returning after progress')
  })

  await step('move a task to tomorrow (original kept, copy linked)', async () => {
    const created = await a.planner.createTask(ctx.today, { title: 'Verify move me' })
    const source = created.plan.occurrences.find((o) => o.title === 'Verify move me')
    ctx.moved = await a.planner.rescheduleOccurrence(source.id, ctx.tomorrow)
    const original = await byTitle(ctx.today, 'Verify move me')
    same([original.planState, original.excludedReason], ['excluded', 'rescheduled'], 'original')
    const copy = (await day(ctx.tomorrow)).find((o) => o.title === 'Verify move me')
    same([copy.planState, copy.rescheduledFromId], ['active', source.id], 'copy')
    same((await a.planner.getDayPlan(ctx.today)).moves[source.id].movedTo, ctx.tomorrow, 'moved-to date')
  })

  await step('set a task aside (not counted in progress)', async () => {
    const created = await a.planner.createTask(ctx.today, { title: 'Verify set aside' })
    const o = created.plan.occurrences.find((x) => x.title === 'Verify set aside')
    await a.planner.setAside(o.id, 'busy_day')
    const plan = await a.planner.getDayPlan(ctx.today)
    same([(await byTitle(ctx.today, 'Verify set aside')).planState, plan.summary.current.percent], ['excluded', 75], 'set aside')
  })

  await step('the Week summary agrees with the day', async () => {
    const week = await a.planner.getWeekSummary({ weekOf: ctx.today })
    same(week.tasksDone, 1, 'tasks done this week')
    const todayEntry = week.days.find((d) => d.date === ctx.today)
    same([todayEntry.remaining, todayEntry.setAsideCount], [1, 2], 'today in the week')
  })

  await step('Progress shows the recurring task correctly', async () => {
    const { habits } = await a.planner.getHabitProgress({ days: 28 })
    const walk = habits.find((h) => h.title === 'Verify walk')
    same([walk.planned, walk.done, walk.percent], [2, 1, 50], 'habit progress')
  })

  await step('editing the recurring task leaves history alone', async () => {
    const result = await a.planner.updateTemplate(ctx.walk.id, { title: 'Verify walk (renamed)' })
    truthy(result.skipped.some((s) => s.reason === 'has_progress'), 'today was skipped because it has progress')
    same((await byTitle(ctx.today, 'Verify walk')).completion, 1, 'today keeps its record')
    same((await byTitle(ctx.twoDaysAgo, 'Verify walk')).completion, 0, 'the past day keeps its record')
  })

  await step('ending the recurring task stops it for new days and keeps the records', async () => {
    await a.planner.archiveTemplate(ctx.walk.id)
    const [template] = (await a.planner.listTemplates({ includeArchived: true })).filter((t) => t.id === ctx.walk.id)
    truthy(template.archivedAt, 'archived')
    const tomorrow = await a.planner.openDay(ctx.tomorrow)
    same(tomorrow.occurrences.filter((o) => o.title.startsWith('Verify walk')).length, 0, 'no new walk tomorrow')
    same((await byTitle(ctx.today, 'Verify walk')).completion, 1, 'today still recorded')
  })

  await step('data persists across sign-out and sign-in', async () => {
    const fresh = await reopenA()
    const plan = await fresh.planner.getDayPlan(ctx.today)
    same(plan.summary.current.percent, 75, 'progress after signing back in')
    same(plan.occurrences.filter((o) => o.title.startsWith('Verify')).length, 4, 'tasks after signing back in')
    truthy((await fresh.planner.listTemplates({ includeArchived: true })).some((t) => t.id === ctx.walk.id && t.archivedAt), 'ended task after signing back in')
  })

  await step('reminders: set and remove a task reminder, preferences saved', async () => {
    const copy = (await day(ctx.tomorrow)).find((o) => o.title === 'Verify move me')
    await a.reminders.savePreferences({ enabled: true, remindTime: '08:30', weekdays: [1, 2, 3, 4, 5, 6, 7] })
    const reminder = await a.reminders.setTaskReminder(copy.id, '08:00')
    same(reminder.planDate, ctx.tomorrow, 'reminder date')
    same((await a.reminders.listTaskReminders()).length, 1, 'reminders listed')
    ctx.reminderOccurrence = copy.id
  })

  // --- isolation: a second signed-in user and an anonymous visitor ---------------------------
  await step('another user sees none of this data', async () => {
    same((await b.planner.listTemplates({ includeArchived: true })).length, 0, 'their templates')
    same((await b.planner.getDayPlan(ctx.today)).exists, false, 'their day')
    same((await b.planner.getHabitProgress()).habits, [], 'their habits')
    same((await b.planner.getRecoveryStatus()).returning, false, 'their recovery status')
    same((await b.reminders.listTaskReminders()).length, 0, 'their reminders')
    same((await b.reminders.getPreferences()).exists, false, 'their reminder settings')
  })

  await step('another user cannot read, change or delete this user\'s rows', async () => {
    const mine = await byTitle(ctx.today, 'Verify walk')
    await blocked(b.client.from('task_occurrences').select('id').eq('id', mine.id), 'read')
    await blocked(b.client.from('task_occurrences').update({ title: 'hijacked' }).eq('id', mine.id).select('id'), 'update')
    await blocked(b.client.from('task_occurrences').delete().eq('id', mine.id).select('id'), 'delete')
    await blocked(b.client.from('task_templates').select('id').eq('id', ctx.walk.id), 'read template')
    await blocked(b.client.from('task_reminders').select('id').eq('occurrence_id', ctx.reminderOccurrence), 'read reminder')
    await rejects(b.planner.setCompletion(mine.id, 1), 'service: complete another user\'s task')
    await rejects(b.planner.updateTemplate(ctx.walk.id, { title: 'hijacked' }), 'service: edit another user\'s template')
    same((await byTitle(ctx.today, 'Verify walk')).title, 'Verify walk', 'the task is unchanged')
  })

  await step('another user cannot create rows that belong to this user', async () => {
    await blocked(b.client.from('task_templates').insert({ user_id: a.userId, title: 'planted', recurrence: 'daily', starts_on: ctx.today }).select('id'), 'plant a template')
    await blocked(b.client.from('day_plans').insert({ user_id: a.userId, plan_date: addDays(ctx.today, 3) }).select('plan_date'), 'plant a day')
  })

  await step('an anonymous visitor can read and write nothing', async () => {
    for (const table of ['profiles', 'task_templates', 'day_plans', 'task_occurrences', 'reminder_preferences', 'task_reminders']) {
      await blocked(anon.client.from(table).select('*'), `anonymous read of ${table}`)
    }
    await blocked(anon.client.from('task_templates').insert({ title: 'anon', recurrence: 'daily', starts_on: ctx.today }).select('id'), 'anonymous insert')
  })

  await step('clients cannot write server-owned columns', async () => {
    const o = await byTitle(ctx.today, 'Verify one-off (edited)')
    await blocked(a.client.from('task_occurrences').update({ completed_at: '2001-01-01T00:00:00Z' }).eq('id', o.id).select('id'), 'completed_at')
    await blocked(a.client.from('task_occurrences').update({ in_original_plan: false }).eq('id', o.id).select('id'), 'in_original_plan')
    await blocked(a.client.from('task_occurrences').update({ user_id: b.userId }).eq('id', o.id).select('id'), 'user_id')
    await blocked(a.client.from('day_plans').update({ baseline_at: '2001-01-01T00:00:00Z' }).eq('plan_date', ctx.today).select('plan_date'), 'baseline_at')
  })

  await step('days older than the editing window cannot be planned or changed', async () => {
    await rejects(a.planner.openDay(addDays(ctx.today, -8)), 'opening a day 8 days ago')
    await blocked(a.client.from('day_plans').insert({ user_id: a.userId, plan_date: addDays(ctx.today, -8) }).select('plan_date'), 'direct insert of an old day')
  })

  await step('finished work cannot be deleted by a client', async () => {
    const done = await byTitle(ctx.today, 'Verify walk')
    await blocked(a.client.from('task_occurrences').delete().eq('id', done.id).select('id'), 'delete a finished task')
    same((await byTitle(ctx.today, 'Verify walk')).completion, 1, 'the finished task is still there')
  })

  await step('clean up what this run created (templates and reminders; history stays by design)', async () => {
    await a.reminders.removeTaskReminder(ctx.reminderOccurrence)
    await a.reminders.resetPreferences()
    same((await a.reminders.listTaskReminders()).length, 0, 'reminders after cleanup')
    return 'finished and moved tasks remain as protected history; delete the two test users to remove everything'
  })

  return results
}
