import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, createUser, setClock, useFixedClock } from './harness.js'
import { CLOCK, TODAY, count, day, insert, occurrence, one, rejects, template } from './plannerSeed.js'

// Runs the real migration SQL in PGlite (Postgres) as the database owner, so RLS and column
// grants are bypassed on purpose: this file checks constraints, triggers and foreign keys,
// i.e. the integrity that must hold even if a policy were wrong. Stand-in for Supabase, not Supabase.
let db
let alice

beforeAll(async () => {
  db = await createDb()
  await useFixedClock(db, CLOCK)
  alice = await createUser(db, 'alice@example.com', 'America/New_York')
}, 60000)
afterAll(async () => {
  await db?.close()
})

describe('task_templates constraints', () => {
  const make = (o) => template(db, alice, o)

  it('accepts valid once, daily and weekly templates and a point-in-time task', async () => {
    await make({ title: 'Daily' })
    await make({ title: 'Weekly', recurrence: 'weekly', weekdays: '{1,3,5}' })
    await make({ title: 'Once', recurrence: 'once', starts_on: TODAY, ends_on: TODAY })
    await make({ title: 'Bedtime', planned_start: '23:00' })
    await make({ title: 'Timed', planned_start: '09:00', planned_end: '10:30', estimated_minutes: 90, category: 'Work', is_priority: true })
  })

  it('limits text lengths', async () => {
    await rejects(make({ title: '   ' }), /task_templates_title_length/)
    await rejects(make({ title: 'x'.repeat(121) }), /task_templates_title_length/)
    await rejects(make({ description: 'x'.repeat(1001) }), /task_templates_description_length/)
    await rejects(make({ category: 'x'.repeat(41) }), /task_templates_category_length/)
    await make({ title: 'x'.repeat(120), category: 'x'.repeat(40), description: 'x'.repeat(1000) })
  })

  it('limits the estimate', async () => {
    await rejects(make({ estimated_minutes: 0 }), /task_templates_estimate_range/)
    await rejects(make({ estimated_minutes: 1441 }), /task_templates_estimate_range/)
    await make({ estimated_minutes: 1 })
    await make({ estimated_minutes: 1440 })
  })

  it('validates times: an end needs a start and must be later', async () => {
    await rejects(make({ planned_end: '10:00' }), /task_templates_time_order/)
    await rejects(make({ planned_start: '10:00', planned_end: '10:00' }), /task_templates_time_order/)
    await rejects(make({ planned_start: '23:00', planned_end: '06:30' }), /task_templates_time_order/) // overnight spans are not allowed
  })

  it('validates recurrence and weekdays', async () => {
    await rejects(make({ recurrence: 'monthly' }), /task_templates_recurrence_valid/)
    await rejects(make({ recurrence: 'weekly' }), /task_templates_weekdays_match/)
    await rejects(make({ recurrence: 'weekly', weekdays: '{}' }), /task_templates_weekdays_match/)
    await rejects(make({ recurrence: 'weekly', weekdays: '{0}' }), /task_templates_weekdays_match/)
    await rejects(make({ recurrence: 'weekly', weekdays: '{8}' }), /task_templates_weekdays_match/)
    await rejects(make({ recurrence: 'weekly', weekdays: '{1,1}' }), /task_templates_weekdays_match/)
    await rejects(make({ recurrence: 'weekly', weekdays: '{1,NULL}' }), /task_templates_weekdays_match/)
    await rejects(make({ recurrence: 'daily', weekdays: '{1}' }), /task_templates_weekdays_match/)
    await rejects(make({ recurrence: 'once', starts_on: TODAY, ends_on: TODAY, weekdays: '{1}' }), /task_templates_weekdays_match/)
    await make({ recurrence: 'weekly', weekdays: '{1,2,3,4,5,6,7}' })
  })

  it('validates dates', async () => {
    await rejects(make({ starts_on: TODAY, ends_on: '2026-03-09' }), /task_templates_dates_ordered/)
    await rejects(make({ recurrence: 'once', starts_on: TODAY, ends_on: '2026-03-11' }), /task_templates_once_single_day/)
    await rejects(make({ recurrence: 'once', starts_on: TODAY }), /task_templates_once_single_day/)
    await make({ starts_on: TODAY, ends_on: TODAY })
  })

  it('caps active templates per user (provisional limit) and does not count archived ones', async () => {
    const carol = await createUser(db, 'carol@example.com')
    await db.query(
      `insert into public.task_templates (user_id, title, recurrence, starts_on)
       select $1, 'T' || g, 'daily', date '2026-01-01' from generate_series(1, 200) g`,
      [carol],
    )
    await rejects(template(db, carol, { title: 'one too many' }), /Too many active tasks/)
    await db.query(`update public.task_templates set archived_at = now() where user_id = $1 and title = 'T1'`, [carol])
    await template(db, carol, { title: 'fits after archiving one' })
    await rejects(db.query(`update public.task_templates set archived_at = null where user_id = $1 and title = 'T1'`, [carol]), /Too many active tasks/)
  })

  it('refreshes updated_at on update', async () => {
    const t = await make({ title: 'Touch me' })
    await new Promise((r) => setTimeout(r, 15))
    await db.query(`update public.task_templates set title = 'Touched' where id = $1`, [t.id])
    const after = await one(db, 'select updated_at > created_at as moved from public.task_templates where id = $1', [t.id])
    expect(after.moved).toBe(true)
  })
})

describe('day_plans', () => {
  it('starts as a Normal day with no baseline and an empty suppression list', async () => {
    const u = await createUser(db, 'day1@example.com', 'America/New_York')
    await day(db, u, TODAY)
    const d = await one(db, 'select day_mode, baseline_at, suppressed_template_ids from public.day_plans where user_id = $1', [u])
    expect(d).toMatchObject({ day_mode: 'normal', baseline_at: null, suppressed_template_ids: [] })
  })

  it('rejects unknown modes and a second plan for the same date', async () => {
    const u = await createUser(db, 'day2@example.com', 'America/New_York')
    await rejects(insert(db, 'day_plans', { user_id: u, plan_date: TODAY, day_mode: 'festival' }), /day_plans_day_mode_valid/)
    await day(db, u, TODAY)
    await rejects(insert(db, 'day_plans', { user_id: u, plan_date: TODAY }), /day_plans_pkey|duplicate key/)
  })

  it('ignores a client-supplied baseline on insert', async () => {
    const u = await createUser(db, 'day3@example.com', 'America/New_York')
    await insert(db, 'day_plans', { user_id: u, plan_date: TODAY, baseline_at: '2020-01-01T00:00:00Z' })
    expect((await one(db, 'select baseline_at from public.day_plans where user_id = $1', [u])).baseline_at).toBeNull()
  })

  it('fixes the baseline when the mode changes away from Normal, keeps it afterwards, and never lets it move', async () => {
    const u = await createUser(db, 'day4@example.com', 'America/New_York')
    await day(db, u, TODAY)
    await db.query(`update public.day_plans set day_mode = 'busy' where user_id = $1`, [u])
    const first = await one(db, `select baseline_at = timestamptz '${CLOCK}' as at_clock from public.day_plans where user_id = $1`, [u])
    expect(first.at_clock).toBe(true)

    await setClock(db, '2026-03-10T20:00:00Z')
    await db.query(`update public.day_plans set day_mode = 'normal' where user_id = $1`, [u])
    await db.query(`update public.day_plans set day_mode = 'rest' where user_id = $1`, [u])
    await db.query(`update public.day_plans set baseline_at = '2030-01-01T00:00:00Z' where user_id = $1`, [u]) // even the owner cannot move it
    const after = await one(db, `select baseline_at = timestamptz '${CLOCK}' as unchanged from public.day_plans where user_id = $1`, [u])
    expect(after.unchanged).toBe(true)
    await setClock(db, CLOCK)
  })

  it('switching back to Normal on a fresh day does not stamp a baseline', async () => {
    const u = await createUser(db, 'day5@example.com', 'America/New_York')
    await day(db, u, TODAY)
    await db.query(`update public.day_plans set day_mode = 'normal' where user_id = $1`, [u])
    expect((await one(db, 'select baseline_at from public.day_plans where user_id = $1', [u])).baseline_at).toBeNull()
  })

  it('limits how far ahead a day can be created (sanity bound of 366 days in the user\'s timezone)', async () => {
    const u = await createUser(db, 'day6@example.com', 'America/New_York')
    await day(db, u, '2027-03-11') // today + 366
    await rejects(day(db, u, '2027-03-12'), /too far ahead/)
  })

  describe('suppression list (C1)', () => {
    it('accepts the user\'s own templates, de-duplicates, and rejects others\' or unknown ids', async () => {
      const u = await createUser(db, 'sup1@example.com', 'America/New_York')
      const other = await createUser(db, 'sup2@example.com', 'America/New_York')
      const mine = await template(db, u)
      const theirs = await template(db, other)
      await day(db, u, TODAY)
      await db.query(`update public.day_plans set suppressed_template_ids = $2 where user_id = $1`, [u, `{${mine.id},${mine.id}}`])
      expect((await one(db, 'select cardinality(suppressed_template_ids) n from public.day_plans where user_id = $1', [u])).n).toBe(1)
      await rejects(db.query(`update public.day_plans set suppressed_template_ids = $2 where user_id = $1`, [u, `{${theirs.id}}`]), /your own tasks/)
      await rejects(db.query(`update public.day_plans set suppressed_template_ids = $2 where user_id = $1`, [u, `{${crypto.randomUUID()}}`]), /your own tasks/)
      await rejects(db.query(`update public.day_plans set suppressed_template_ids = '{NULL}' where user_id = $1`, [u]), /your own tasks/)
    })

    it('removes a template id from suppression lists when the template is deleted', async () => {
      const u = await createUser(db, 'sup3@example.com', 'America/New_York')
      const t = await template(db, u)
      await day(db, u, TODAY)
      await day(db, u, '2026-03-01') // an old, read-only day is cleaned too
      await db.query(`update public.day_plans set suppressed_template_ids = $2 where user_id = $1`, [u, `{${t.id}}`])
      await db.query(`delete from public.task_templates where id = $1`, [t.id])
      expect(await count(db, 'day_plans', `user_id = $1 and cardinality(suppressed_template_ids) = 0`, [u])).toBe(2)
    })
  })
})

describe('task_occurrences: completion, state and server-maintained fields', () => {
  let u
  beforeAll(async () => {
    u = await createUser(db, 'occ@example.com', 'America/New_York')
  })
  const make = (o = {}, date = TODAY) => occurrence(db, u, date, o)

  it('accepts exactly 0, 0.5 and 1 (D1)', async () => {
    for (const completion of [0, 0.5, 1]) {
      const o = await make({ completion })
      expect(Number(o.completion)).toBe(completion)
    }
  })

  it('rejects everything else, including values that rounding would have turned into valid ones', async () => {
    for (const bad of [0.25, 0.75, 0.45, 0.95, 0.05, 1.5, 2, -0.5, -1]) {
      await rejects(make({ completion: bad }), /task_occurrences_completion_valid/)
    }
  })

  it('sets completed_at on the server and clears it at 0, ignoring client-supplied values', async () => {
    const pending = await make({ completed_at: '2020-01-01T00:00:00Z' })
    expect(pending.completed_at).toBeNull()
    const done = await make({ completion: 1, completed_at: '2020-01-01T00:00:00Z' })
    expect(done.completed_at.toISOString()).toBe('2026-03-10T15:00:00.000Z')
    await db.query('update public.task_occurrences set completion = 0 where id = $1', [done.id])
    expect((await one(db, 'select completed_at from public.task_occurrences where id = $1', [done.id])).completed_at).toBeNull()
  })

  it('keeps completed_at stable when completion does not change', async () => {
    const o = await make({ completion: 0.5 })
    await setClock(db, '2026-03-10T18:00:00Z')
    await db.query(`update public.task_occurrences set title = 'Renamed' where id = $1`, [o.id])
    expect((await one(db, 'select completed_at from public.task_occurrences where id = $1', [o.id])).completed_at.toISOString()).toBe('2026-03-10T15:00:00.000Z')
    await db.query('update public.task_occurrences set completion = 1 where id = $1', [o.id])
    expect((await one(db, 'select completed_at from public.task_occurrences where id = $1', [o.id])).completed_at.toISOString()).toBe('2026-03-10T18:00:00.000Z')
    await setClock(db, CLOCK)
  })

  describe('plan state (C2)', () => {
    it('a set-aside task needs a reason and gets excluded_at from the server', async () => {
      const o = await make({ plan_state: 'excluded', excluded_reason: 'busy_day', excluded_at: '2020-01-01T00:00:00Z' })
      expect(o.excluded_at.toISOString()).toBe('2026-03-10T15:00:00.000Z')
      await rejects(make({ plan_state: 'excluded' }), /task_occurrences_excluded_fields_match/)
      await rejects(make({ excluded_reason: 'busy_day' }), /task_occurrences_excluded_fields_match/)
      await rejects(make({ plan_state: 'excluded', excluded_reason: 'bored' }), /task_occurrences_excluded_reason_valid/)
      await rejects(make({ plan_state: 'dormant' }), /task_occurrences_plan_state_valid/)
    })

    it('a partially completed task may be set aside, with every reason', async () => {
      for (const reason of ['rescheduled', 'busy_day', 'rest_day', 'removed']) {
        const o = await make({ completion: 0.5, plan_state: 'excluded', excluded_reason: reason })
        expect(Number(o.completion)).toBe(0.5)
      }
    })

    it('a done task may not be set aside, on insert or update', async () => {
      await rejects(make({ completion: 1, plan_state: 'excluded', excluded_reason: 'busy_day' }), /task_occurrences_done_stays_active/)
      const done = await make({ completion: 1 })
      await rejects(db.query(`update public.task_occurrences set plan_state = 'excluded', excluded_reason = 'busy_day' where id = $1`, [done.id]), /task_occurrences_done_stays_active/)
      const set = await make({ completion: 0.5, plan_state: 'excluded', excluded_reason: 'busy_day' })
      await rejects(db.query('update public.task_occurrences set completion = 1 where id = $1', [set.id]), /task_occurrences_done_stays_active/)
    })

    it('restoring clears the reason and excluded_at', async () => {
      const o = await make({ plan_state: 'excluded', excluded_reason: 'busy_day' })
      await db.query(`update public.task_occurrences set plan_state = 'active', excluded_reason = null where id = $1`, [o.id])
      expect(await one(db, 'select plan_state, excluded_reason, excluded_at from public.task_occurrences where id = $1', [o.id])).toEqual({ plan_state: 'active', excluded_reason: null, excluded_at: null })
    })

    it('keeps excluded_at stable while a task stays set aside', async () => {
      const o = await make({ plan_state: 'excluded', excluded_reason: 'busy_day' })
      await setClock(db, '2026-03-10T19:00:00Z')
      await db.query(`update public.task_occurrences set excluded_reason = 'rest_day' where id = $1`, [o.id])
      expect((await one(db, 'select excluded_at from public.task_occurrences where id = $1', [o.id])).excluded_at.toISOString()).toBe('2026-03-10T15:00:00.000Z')
      await setClock(db, CLOCK)
    })
  })

  it('limits text, estimate and time order like templates do', async () => {
    await rejects(make({ title: '' }), /task_occurrences_title_length/)
    await rejects(make({ estimated_minutes: 0 }), /task_occurrences_estimate_range/)
    await rejects(make({ planned_end: '10:00' }), /task_occurrences_time_order/)
  })

  it('rejects progress for a future date but allows pending tasks there (planning ahead)', async () => {
    await make({}, '2026-03-12')
    await rejects(make({ completion: 0.5 }, '2026-03-12'), /today or earlier/)
    const pending = await make({}, '2026-03-12')
    await rejects(db.query('update public.task_occurrences set completion = 1 where id = $1', [pending.id]), /today or earlier/)
  })

  it('uses the user\'s own timezone to decide what "future" means', async () => {
    const tokyo = await createUser(db, 'tokyo@example.com', 'Asia/Tokyo')
    // 2026-03-10T15:00Z is already 2026-03-11 00:00 in Tokyo, so the 11th is "today" for them, but not for New York.
    await occurrence(db, tokyo, '2026-03-11', { completion: 0.5 })
    await rejects(occurrence(db, u, '2026-03-11', { completion: 0.5 }), /today or earlier/)
  })

  it('a task cannot be its own moved-from source', async () => {
    await day(db, u, TODAY)
    const id = crypto.randomUUID()
    await rejects(insert(db, 'task_occurrences', { id, user_id: u, plan_date: TODAY, title: 'loop', rescheduled_from_id: id }), /task_occurrences_not_self_moved/)
  })

  it('allows one occurrence per template per date, but several manual tasks', async () => {
    const t = await template(db, u, { title: 'Unique per day' })
    await make({ template_id: t.id })
    await rejects(make({ template_id: t.id }), /task_occurrences_template_date_key/)
    await make({ template_id: t.id }, '2026-03-09') // another date is fine
    await make({ template_id: null })
    await make({ template_id: null })
  })

  it('caps occurrences per day (provisional limit)', async () => {
    const v = await createUser(db, 'cap@example.com', 'America/New_York')
    await day(db, v, TODAY)
    await db.query(
      `insert into public.task_occurrences (user_id, plan_date, title) select $1, date '${TODAY}', 'T' || g from generate_series(1, 100) g`,
      [v],
    )
    await rejects(occurrence(db, v, TODAY, { title: 'one too many' }), /Too many tasks on one day/)
    await occurrence(db, v, '2026-03-09', { title: 'another day is separate' })
  })
})

describe('original plan and baseline (D11, C1)', () => {
  it('tasks created before the baseline are original; tasks created after are not', async () => {
    const u = await createUser(db, 'plan1@example.com', 'America/New_York')
    const before = await occurrence(db, u, TODAY, { title: 'morning' })
    expect(before.in_original_plan).toBe(true)
    await db.query(`update public.day_plans set day_mode = 'busy' where user_id = $1`, [u])
    const after = await occurrence(db, u, TODAY, { title: 'added later' })
    expect(after.in_original_plan).toBe(false)
  })

  it('the original flag can never be changed afterwards, even by the owner', async () => {
    const u = await createUser(db, 'plan2@example.com', 'America/New_York')
    const o = await occurrence(db, u, TODAY)
    await db.query('update public.task_occurrences set in_original_plan = false where id = $1', [o.id])
    expect((await one(db, 'select in_original_plan from public.task_occurrences where id = $1', [o.id])).in_original_plan).toBe(true)
  })

  it('the first progress fixes the day baseline (once)', async () => {
    const u = await createUser(db, 'plan3@example.com', 'America/New_York')
    const a = await occurrence(db, u, TODAY)
    const b = await occurrence(db, u, TODAY)
    expect((await one(db, 'select baseline_at from public.day_plans where user_id = $1', [u])).baseline_at).toBeNull()
    await db.query('update public.task_occurrences set completion = 0.5 where id = $1', [a.id])
    expect((await one(db, `select baseline_at = timestamptz '${CLOCK}' as ok from public.day_plans where user_id = $1`, [u])).ok).toBe(true)
    await setClock(db, '2026-03-10T21:00:00Z')
    await db.query('update public.task_occurrences set completion = 1 where id = $1', [b.id])
    expect((await one(db, `select baseline_at = timestamptz '${CLOCK}' as ok from public.day_plans where user_id = $1`, [u])).ok).toBe(true) // not re-stamped
    await setClock(db, CLOCK)
  })

  it('the first set-aside fixes the baseline; resetting progress to 0 does not', async () => {
    const u = await createUser(db, 'plan4@example.com', 'America/New_York')
    const a = await occurrence(db, u, TODAY)
    await db.query(`update public.task_occurrences set plan_state = 'excluded', excluded_reason = 'busy_day' where id = $1`, [a.id])
    expect((await one(db, 'select baseline_at is not null as ok from public.day_plans where user_id = $1', [u])).ok).toBe(true)

    const v = await createUser(db, 'plan5@example.com', 'America/New_York')
    const b = await occurrence(db, v, TODAY)
    await db.query('update public.task_occurrences set completion = 0 where id = $1', [b.id])
    expect((await one(db, 'select baseline_at from public.day_plans where user_id = $1', [v])).baseline_at).toBeNull()
  })

  it('deleting a task before the baseline exists does not fix the baseline (C1: composing the plan)', async () => {
    const u = await createUser(db, 'plan6@example.com', 'America/New_York')
    const o = await occurrence(db, u, TODAY)
    await db.query('delete from public.task_occurrences where id = $1', [o.id])
    expect((await one(db, 'select baseline_at from public.day_plans where user_id = $1', [u])).baseline_at).toBeNull()
  })

  it('original and revised plans come from the same rows', async () => {
    const u = await createUser(db, 'plan7@example.com', 'America/New_York')
    await occurrence(db, u, TODAY, { title: 'a' })
    await occurrence(db, u, TODAY, { title: 'b' })
    await occurrence(db, u, TODAY, { title: 'c', completion: 1 })
    await db.query(`update public.task_occurrences set plan_state = 'excluded', excluded_reason = 'busy_day' where user_id = $1 and title = 'b'`, [u])
    await occurrence(db, u, TODAY, { title: 'late' })
    const r = await one(
      db,
      `select count(*) filter (where in_original_plan) as original,
              count(*) filter (where plan_state = 'active') as current,
              sum(completion) filter (where in_original_plan) as original_units,
              sum(completion) filter (where plan_state = 'active') as current_units
         from public.task_occurrences where user_id = $1`,
      [u],
    )
    expect(r).toMatchObject({ original: 3, current: 3 }) // a, b, c existed at the baseline; 'late' did not
    expect(Number(r.original_units)).toBe(1)
    expect(Number(r.current_units)).toBe(1)
  })
})

describe('foreign keys: no cross-user references, history survives deletion', () => {
  let a
  let b
  beforeAll(async () => {
    a = await createUser(db, 'fk-a@example.com', 'America/New_York')
    b = await createUser(db, 'fk-b@example.com', 'America/New_York')
  })

  it('refuses an occurrence that points at another user\'s template', async () => {
    const bobsTemplate = await template(db, b)
    await rejects(occurrence(db, a, TODAY, { template_id: bobsTemplate.id }), /task_occurrences_template_fk|foreign key/)
  })

  it('refuses an occurrence moved-from another user\'s occurrence', async () => {
    const bobsOcc = await occurrence(db, b, TODAY)
    await rejects(occurrence(db, a, TODAY, { rescheduled_from_id: bobsOcc.id }), /task_occurrences_rescheduled_from_fk|foreign key/)
  })

  it('refuses an occurrence on a day that user has not created, even if another user has that day', async () => {
    await day(db, b, '2026-03-08')
    await rejects(insert(db, 'task_occurrences', { user_id: a, plan_date: '2026-03-08', title: 'orphan' }), /task_occurrences_day_fk|foreign key/)
  })

  it('refuses a day plan for a user that does not exist', async () => {
    await rejects(insert(db, 'day_plans', { user_id: crypto.randomUUID(), plan_date: TODAY }), /foreign key/)
  })

  it('accepts same-user references', async () => {
    const t = await template(db, a, { title: 'mine' })
    const source = await occurrence(db, a, TODAY, { template_id: t.id })
    const moved = await occurrence(db, a, '2026-03-12', { template_id: t.id, rescheduled_from_id: source.id })
    expect(moved.rescheduled_from_id).toBe(source.id)
  })

  it('deleting a template keeps its occurrences and their snapshot (history survives)', async () => {
    const t = await template(db, a, { title: 'Soon deleted', planned_start: '07:00' })
    const o = await occurrence(db, a, '2026-03-09', { template_id: t.id, title: 'Soon deleted', planned_start: '07:00', completion: 1 })
    await db.query('delete from public.task_templates where id = $1', [t.id])
    const kept = await one(db, 'select user_id, template_id, title, planned_start, completion from public.task_occurrences where id = $1', [o.id])
    expect(kept).toMatchObject({ user_id: a, template_id: null, title: 'Soon deleted', planned_start: '07:00:00' })
    expect(Number(kept.completion)).toBe(1)
  })

  it('deleting a moved-from source clears only the link', async () => {
    const source = await occurrence(db, a, TODAY, { title: 'source' })
    const moved = await occurrence(db, a, '2026-03-13', { title: 'moved', rescheduled_from_id: source.id })
    await db.query('delete from public.task_occurrences where id = $1', [source.id])
    expect(await one(db, 'select user_id, rescheduled_from_id, title from public.task_occurrences where id = $1', [moved.id])).toMatchObject({ user_id: a, rescheduled_from_id: null, title: 'moved' })
  })

  it('deleting a day plan removes its occurrences (cascade)', async () => {
    await occurrence(db, a, '2026-03-07', { title: 'goes with the day' })
    await db.query(`delete from public.day_plans where user_id = $1 and plan_date = '2026-03-07'`, [a])
    expect(await count(db, 'task_occurrences', `user_id = $1 and plan_date = '2026-03-07'`, [a])).toBe(0)
  })

  it('deleting a user removes everything they own, including old days and progress', async () => {
    const c = await createUser(db, 'fk-c@example.com', 'America/New_York')
    const t = await template(db, c)
    await occurrence(db, c, '2026-02-01', { completion: 1, template_id: t.id }) // far outside the editing window
    await occurrence(db, c, TODAY, { completion: 0.5 })
    await db.query('delete from auth.users where id = $1', [c])
    for (const table of ['task_templates', 'day_plans', 'task_occurrences']) {
      expect(await count(db, table, 'user_id = $1', [c]), table).toBe(0)
    }
  })

  it('other users\' data is untouched by those deletions', async () => {
    expect(await count(db, 'task_templates', 'user_id = $1', [b])).toBeGreaterThan(0)
    expect(await count(db, 'task_occurrences', 'user_id = $1', [b])).toBeGreaterThan(0)
  })
})

describe('migration hygiene', () => {
  it('creates exactly the three planner tables, all with RLS enabled', async () => {
    const { rows } = await db.query(
      `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' order by c.relname`,
    )
    expect(rows.map((r) => r.relname)).toEqual(['day_plans', 'profiles', 'task_occurrences', 'task_templates'])
    expect(rows.every((r) => r.relrowsecurity)).toBe(true)
  })

  it('has the expected foreign keys, all with the intended delete behaviour', async () => {
    const { rows } = await db.query(
      `select conname, confdeltype, pg_get_constraintdef(oid) as def from pg_constraint
        where contype = 'f' and connamespace = 'public'::regnamespace and conrelid <> 'public.profiles'::regclass order by conname`,
    )
    const byName = Object.fromEntries(rows.map((r) => [r.conname, r]))
    expect(byName.task_occurrences_day_fk.confdeltype).toBe('c') // cascade
    expect(byName.task_occurrences_template_fk.def).toMatch(/ON DELETE SET NULL \(template_id\)/)
    expect(byName.task_occurrences_rescheduled_from_fk.def).toMatch(/ON DELETE SET NULL \(rescheduled_from_id\)/)
    expect(rows.filter((r) => /profiles/.test(r.def)).every((r) => r.confdeltype === 'c')).toBe(true)
  })
})
