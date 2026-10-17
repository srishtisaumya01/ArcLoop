import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asUser, createDb, createUser, setClock, useFixedClock } from './harness.js'
import { CLOCK, TODAY, count, day, occurrence, one, rejects, template } from './plannerSeed.js'

// Security tests for the planner tables, run as API clients (roles `authenticated` / `anon`
// with a JWT subject), the way PostgREST would connect. They use PGlite with stand-ins for
// Supabase's roles and auth.uid(), so they verify the migration's RLS policies and grants in
// Postgres. They are NOT a test of a real Supabase project: PostgREST, default privileges on
// a hosted project, and the auth service itself are not exercised.
let db
let alice
let bob
let carol // lives in Pacific/Kiritimati (UTC+14), so her "today" is a day ahead of New York's

beforeAll(async () => {
  db = await createDb()
  await useFixedClock(db, CLOCK)
  alice = await createUser(db, 'alice@example.com', 'America/New_York')
  bob = await createUser(db, 'bob@example.com', 'America/New_York')
  carol = await createUser(db, 'carol@example.com', 'Pacific/Kiritimati')
}, 60000)
afterAll(async () => {
  await db?.close()
})

const as = (userId, sql, params = []) => asUser(db, userId, (d) => d.query(sql, params))
const rows = async (userId, sql, params = []) => (await as(userId, sql, params)).rows
const affected = async (userId, sql, params = []) => (await as(userId, sql, params)).affectedRows

describe('a user can use their own planner data', () => {
  it('creates, reads, updates and deletes their own task, day and occurrence', async () => {
    const [tpl] = await rows(
      alice,
      `insert into public.task_templates (user_id, title, recurrence, starts_on, estimated_minutes, category, is_priority)
       values ($1, 'Read', 'daily', '2026-03-01', 30, 'Reading', true) returning id, title`,
      [alice],
    )
    expect(tpl.title).toBe('Read')

    await as(alice, `insert into public.day_plans (user_id, plan_date) values ($1, '${TODAY}')`, [alice])
    const [occ] = await rows(
      alice,
      `insert into public.task_occurrences (user_id, plan_date, template_id, title) values ($1, '${TODAY}', $2, 'Read') returning id`,
      [alice, tpl.id],
    )

    expect(await rows(alice, 'select title from public.task_templates where id = $1', [tpl.id])).toHaveLength(1)
    expect(await affected(alice, `update public.task_templates set title = 'Read more' where id = $1`, [tpl.id])).toBe(1)
    expect(await affected(alice, `update public.task_occurrences set completion = 0.5 where id = $1`, [occ.id])).toBe(1)
    expect(await affected(alice, `update public.day_plans set day_mode = 'busy' where user_id = $1`, [alice])).toBe(1)
    expect(await affected(alice, 'delete from public.task_templates where id = $1', [tpl.id])).toBe(1)
    // the occurrence (now with progress) survives its template being deleted
    expect(await rows(alice, 'select template_id, title from public.task_occurrences where id = $1', [occ.id])).toEqual([{ template_id: null, title: 'Read' }])
  })
})

describe('a user cannot see or touch another user\'s data', () => {
  let bobTpl
  let bobOcc
  let bobDoneOcc
  beforeAll(async () => {
    bobTpl = await template(db, bob, { title: 'Bob private routine' })
    bobOcc = await occurrence(db, bob, TODAY, { title: 'Bob private task', template_id: bobTpl.id })
    bobDoneOcc = await occurrence(db, bob, TODAY, { title: 'Bob done task', completion: 1 })
    await db.query(`update public.day_plans set day_mode = 'busy' where user_id = $1`, [bob])
    await template(db, alice, { title: 'Alice routine' })
    await occurrence(db, alice, TODAY, { title: 'Alice task' })
  })

  it('an unfiltered read returns only the caller\'s own rows (no client-side filtering involved)', async () => {
    for (const table of ['task_templates', 'day_plans', 'task_occurrences']) {
      const own = await rows(alice, `select user_id from public.${table}`)
      expect(own.length, table).toBeGreaterThan(0)
      expect(own.every((r) => r.user_id === alice), table).toBe(true)
    }
    expect((await rows(alice, 'select title from public.task_occurrences')).map((r) => r.title)).not.toContain('Bob private task')
  })

  it('asking for another user\'s rows by id or by user returns nothing', async () => {
    expect(await rows(alice, 'select 1 from public.task_templates where id = $1', [bobTpl.id])).toEqual([])
    expect(await rows(alice, 'select 1 from public.task_occurrences where id = $1', [bobOcc.id])).toEqual([])
    expect(await rows(alice, 'select 1 from public.task_templates where user_id = $1', [bob])).toEqual([])
    expect(await rows(alice, 'select 1 from public.day_plans where user_id = $1', [bob])).toEqual([])
  })

  it('cannot reach another user\'s rows through a join or subquery', async () => {
    expect(await rows(alice, `select o.title from public.task_occurrences o join public.task_templates t on t.id = o.template_id where t.id = $1`, [bobTpl.id])).toEqual([])
    expect(await rows(alice, `select title from public.task_occurrences where template_id in (select id from public.task_templates where user_id = $1)`, [bob])).toEqual([])
    expect(await rows(alice, `select title from public.task_templates where id = any (select template_id from public.task_occurrences where id = $1)`, [bobOcc.id])).toEqual([])
  })

  it('cannot insert rows owned by another user', async () => {
    await rejects(as(alice, `insert into public.task_templates (user_id, title, recurrence, starts_on) values ($1, 'planted', 'daily', '2026-03-01')`, [bob]), /row-level security/)
    await rejects(as(alice, `insert into public.day_plans (user_id, plan_date) values ($1, '2026-03-09')`, [bob]), /row-level security/)
    await rejects(as(alice, `insert into public.task_occurrences (user_id, plan_date, title) values ($1, '${TODAY}', 'planted')`, [bob]), /row-level security/)
    expect(await count(db, 'task_templates', `title = 'planted'`)).toBe(0)
    expect(await count(db, 'task_occurrences', `title = 'planted'`)).toBe(0)
  })

  it('cannot update or delete another user\'s rows (they are invisible: zero rows affected)', async () => {
    expect(await affected(alice, `update public.task_templates set title = 'hacked' where id = $1`, [bobTpl.id])).toBe(0)
    expect(await affected(alice, `update public.task_occurrences set title = 'hacked', completion = 0 where id = $1`, [bobOcc.id])).toBe(0)
    expect(await affected(alice, `update public.task_occurrences set completion = 0 where id = $1`, [bobDoneOcc.id])).toBe(0)
    expect(await affected(alice, `update public.day_plans set day_mode = 'normal' where user_id = $1`, [bob])).toBe(0)
    expect(await affected(alice, 'delete from public.task_templates where id = $1', [bobTpl.id])).toBe(0)
    expect(await affected(alice, 'delete from public.task_occurrences where id = $1', [bobOcc.id])).toBe(0)
    expect(await count(db, 'task_templates', `title = 'hacked'`)).toBe(0)
    expect(await count(db, 'task_occurrences', `title = 'hacked'`)).toBe(0)
    expect(await count(db, 'day_plans', `user_id = $1 and day_mode = 'busy'`, [bob])).toBe(1)
    expect(Number((await one(db, 'select completion from public.task_occurrences where id = $1', [bobDoneOcc.id])).completion)).toBe(1)
  })

  it('cannot hand a row to another user by changing user_id (no privilege to write it)', async () => {
    const mine = await one(db, `select id from public.task_occurrences where user_id = $1 limit 1`, [alice])
    await rejects(as(alice, 'update public.task_occurrences set user_id = $1 where id = $2', [bob, mine.id]), /permission denied/)
    await rejects(as(alice, 'update public.task_templates set user_id = $1 where user_id = $2', [bob, alice]), /permission denied/)
    await rejects(as(alice, 'update public.day_plans set user_id = $1 where user_id = $2', [bob, alice]), /permission denied/)
  })

  it('cannot attach her records to another user\'s records (no cross-user relationships)', async () => {
    await rejects(as(alice, `insert into public.task_occurrences (user_id, plan_date, title, template_id) values ($1, '${TODAY}', 'x', $2)`, [alice, bobTpl.id]), /foreign key|violates/)
    await rejects(as(alice, `insert into public.task_occurrences (user_id, plan_date, title, rescheduled_from_id) values ($1, '${TODAY}', 'x', $2)`, [alice, bobOcc.id]), /foreign key|violates/)
    await rejects(as(alice, `update public.day_plans set suppressed_template_ids = $2 where user_id = $1`, [alice, `{${bobTpl.id}}`]), /your own tasks/)
    expect(await count(db, 'task_occurrences', `title = 'x'`)).toBe(0)
  })

  it('an occurrence cannot be placed on a day that user has not created', async () => {
    await rejects(as(alice, `insert into public.task_occurrences (user_id, plan_date, title) values ($1, '2026-03-08', 'x')`, [alice]), /foreign key|violates/)
  })

  it('an authenticated session with no user id sees and creates nothing', async () => {
    await db.exec('set role authenticated')
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
    try {
      for (const table of ['task_templates', 'day_plans', 'task_occurrences']) {
        expect((await db.query(`select 1 from public.${table}`)).rows, table).toEqual([])
      }
      await rejects(db.query(`insert into public.task_templates (user_id, title, recurrence, starts_on) values ($1, 'x', 'daily', '2026-03-01')`, [alice]), /row-level security/)
    } finally {
      await db.exec('reset role')
    }
  })
})

describe('anonymous access is denied', () => {
  it('has no privileges on any planner table', async () => {
    for (const table of ['task_templates', 'day_plans', 'task_occurrences']) {
      await rejects(as(null, `select 1 from public.${table}`), /permission denied/)
      await rejects(as(null, `delete from public.${table}`), /permission denied/)
      for (const priv of ['select', 'insert', 'update', 'delete']) {
        expect((await one(db, `select has_table_privilege('anon', 'public.${table}', '${priv}') as p`)).p, `${table} ${priv}`).toBe(false)
      }
    }
    await rejects(as(null, `insert into public.task_templates (user_id, title, recurrence, starts_on) values ($1, 'x', 'daily', '2026-03-01')`, [alice]), /permission denied/)
    await rejects(as(null, `update public.task_occurrences set title = 'x'`), /permission denied/)
  })

  it('cannot call the planner helper functions', async () => {
    await rejects(as(null, 'select public.planner_today($1)', [alice]), /permission denied/)
    await rejects(as(null, 'select public.planner_now()'), /permission denied/)
  })
})

describe('server-maintained fields cannot be written by a client', () => {
  let mine
  beforeAll(async () => {
    mine = await occurrence(db, alice, '2026-03-09', { title: 'column grant target' })
  })

  it('cannot set in_original_plan, completion, state or timestamps when creating an occurrence', async () => {
    for (const col of ['in_original_plan', 'completion', 'completed_at', 'plan_state', 'excluded_reason', 'excluded_at', 'created_at']) {
      const value = { in_original_plan: 'false', completion: '1', completed_at: 'now()', plan_state: "'excluded'", excluded_reason: "'removed'", excluded_at: 'now()', created_at: 'now()' }[col]
      await rejects(as(alice, `insert into public.task_occurrences (user_id, plan_date, title, ${col}) values ($1, '2026-03-09', 'x', ${value})`, [alice]), /permission denied/)
    }
  })

  it('cannot change in_original_plan, timestamps, plan_date, template_id or the moved-from link afterwards', async () => {
    for (const set of ['in_original_plan = false', 'completed_at = now()', 'excluded_at = now()', "plan_date = '2026-03-10'", 'template_id = null', 'rescheduled_from_id = null', 'created_at = now()', 'id = gen_random_uuid()']) {
      await rejects(as(alice, `update public.task_occurrences set ${set} where id = $1`, [mine.id]), /permission denied/)
    }
  })

  it('cannot write the baseline, the creation time or the key of a day plan', async () => {
    await rejects(as(alice, `insert into public.day_plans (user_id, plan_date, baseline_at) values ($1, '2026-03-11', now())`, [alice]), /permission denied/)
    await rejects(as(alice, `insert into public.day_plans (user_id, plan_date, day_mode) values ($1, '2026-03-11', 'rest')`, [alice]), /permission denied/)
    for (const set of ['baseline_at = now()', "plan_date = '2026-03-11'", 'created_at = now()']) {
      await rejects(as(alice, `update public.day_plans set ${set} where user_id = $1 and plan_date = '2026-03-09'`, [alice]), /permission denied/)
    }
  })

  it('cannot change a template\'s owner, id or creation time', async () => {
    const t = await template(db, alice, { title: 'grant target' })
    for (const set of ['id = gen_random_uuid()', 'created_at = now()', 'updated_at = now()']) {
      await rejects(as(alice, `update public.task_templates set ${set} where id = $1`, [t.id]), /permission denied/)
    }
  })

  it('still gets the right values: the server fixes completed_at, in_original_plan and the baseline', async () => {
    const u = await createUser(db, 'server-fields@example.com', 'America/New_York')
    await as(u, `insert into public.day_plans (user_id, plan_date) values ($1, '${TODAY}')`, [u])
    const [first] = await rows(u, `insert into public.task_occurrences (user_id, plan_date, title) values ($1, '${TODAY}', 'first') returning id, in_original_plan`, [u])
    expect(first.in_original_plan).toBe(true)

    await as(u, 'update public.task_occurrences set completion = 0.5 where id = $1', [first.id])
    const stamped = await rows(u, `select o.completed_at = timestamptz '${CLOCK}' as completed_ok, d.baseline_at = timestamptz '${CLOCK}' as baseline_ok
                                     from public.task_occurrences o join public.day_plans d using (user_id, plan_date) where o.id = $1`, [first.id])
    expect(stamped[0]).toEqual({ completed_ok: true, baseline_ok: true }) // the client could not write either; the server did

    const [late] = await rows(u, `insert into public.task_occurrences (user_id, plan_date, title) values ($1, '${TODAY}', 'late') returning in_original_plan`, [u])
    expect(late.in_original_plan).toBe(false) // created after the baseline
  })

  it('a mode change from the client fixes the baseline', async () => {
    const u = await createUser(db, 'mode@example.com', 'America/New_York')
    await as(u, `insert into public.day_plans (user_id, plan_date) values ($1, '${TODAY}')`, [u])
    await as(u, `update public.day_plans set day_mode = 'rest' where user_id = $1`, [u])
    expect((await rows(u, 'select baseline_at is not null as ok from public.day_plans where user_id = $1', [u]))[0].ok).toBe(true)
  })

  it('cannot call the trigger functions directly', async () => {
    for (const fn of ['task_occurrences_guard', 'day_plans_guard', 'task_templates_guard', 'task_occurrences_stamp_baseline', 'task_templates_cleanup_suppression', 'planner_touch_updated_at']) {
      await rejects(as(alice, `select public.${fn}()`), /permission denied/)
    }
  })
})

describe('the 7-date editing window (D5) is enforced by the database', () => {
  // Fixed clock: 2026-03-10T15:00Z. New York today = 2026-03-10, so editable dates are 2026-03-04 .. today (+ planning ahead).
  let u
  beforeAll(async () => {
    u = await createUser(db, 'window@example.com', 'America/New_York')
    for (const date of ['2026-03-03', '2026-03-04']) {
      await occurrence(db, u, date, { title: `pending ${date}` })
      await occurrence(db, u, date, { title: `done ${date}`, completion: 1 })
    }
  })

  it('old days stay readable (history is visible)', async () => {
    expect(await rows(u, `select title from public.task_occurrences where plan_date = '2026-03-03' order by title`)).toHaveLength(2)
    expect(await rows(u, `select 1 from public.day_plans where plan_date = '2026-03-03'`)).toHaveLength(1)
  })

  it('today minus 6 is editable; today minus 7 is read-only', async () => {
    expect(await affected(u, `update public.task_occurrences set title = 'edited' where plan_date = '2026-03-04' and title like 'pending%'`)).toBe(1)
    expect(await affected(u, `update public.task_occurrences set title = 'edited' where plan_date = '2026-03-03'`)).toBe(0)
    expect(await affected(u, `update public.task_occurrences set completion = 0 where plan_date = '2026-03-03'`)).toBe(0) // cannot undo history
    expect(await affected(u, `update public.day_plans set day_mode = 'busy' where plan_date = '2026-03-03'`)).toBe(0)
    expect(await affected(u, `update public.day_plans set suppressed_template_ids = '{}' where plan_date = '2026-03-03'`)).toBe(0)
    expect(await affected(u, `update public.day_plans set day_mode = 'busy' where plan_date = '2026-03-04'`)).toBe(1)
  })

  it('old days cannot be created, added to or deleted from', async () => {
    await rejects(as(u, `insert into public.day_plans (user_id, plan_date) values ($1, '2026-03-02')`, [u]), /row-level security/) // backfill
    await rejects(as(u, `insert into public.task_occurrences (user_id, plan_date, title) values ($1, '2026-03-03', 'backfill')`, [u]), /row-level security/)
    expect(await affected(u, `delete from public.task_occurrences where plan_date = '2026-03-03' and title like 'pending%'`)).toBe(0)
    expect(await count(db, 'task_occurrences', `user_id = $1 and plan_date = '2026-03-03'`, [u])).toBe(2) // nothing changed
  })

  it('the 4 dates around the boundary behave exactly: 03-03 locked, 03-04 open', async () => {
    const result = {}
    for (const date of ['2026-03-03', '2026-03-04']) {
      result[date] = await affected(u, `update public.task_occurrences set is_customized = true where plan_date = '${date}' and title like 'done%'`)
    }
    expect(result).toEqual({ '2026-03-03': 0, '2026-03-04': 1 })
  })

  it('the boundary moves at local midnight in the user\'s own timezone', async () => {
    const edit = () => affected(u, `update public.task_occurrences set is_customized = false where plan_date = '2026-03-04' and title like 'done%'`)
    await setClock(db, '2026-03-11T03:59:00Z') // 23:59 EDT on 03-10: today is still 03-10
    expect(await edit()).toBe(1)
    await setClock(db, '2026-03-11T04:00:00Z') // 00:00 EDT on 03-11: today is 03-11, so 03-04 is now 7 days back
    expect(await edit()).toBe(0)
    await setClock(db, CLOCK)
  })

  it('two users at the same instant can have different windows', async () => {
    await occurrence(db, carol, '2026-03-04', { title: 'carol pending' })
    // At the fixed clock it is already 2026-03-11 in Kiritimati, so 03-04 is outside her window but inside Alice's.
    expect(await affected(carol, `update public.task_occurrences set title = 'x' where plan_date = '2026-03-04'`)).toBe(0)
    expect(await affected(u, `update public.task_occurrences set title = 'x' where plan_date = '2026-03-04' and title like 'edited'`)).toBe(1)
  })

  it('progress cannot be recorded for a future date, but a future day can be planned', async () => {
    await as(u, `insert into public.day_plans (user_id, plan_date) values ($1, '2026-03-12')`, [u])
    const [future] = await rows(u, `insert into public.task_occurrences (user_id, plan_date, title) values ($1, '2026-03-12', 'planned ahead') returning id`, [u])
    await rejects(as(u, 'update public.task_occurrences set completion = 0.5 where id = $1', [future.id]), /today or earlier/)
    expect(await affected(u, `update public.task_occurrences set estimated_minutes = 30 where id = $1`, [future.id])).toBe(1)
  })

  it('a day beyond the sanity bound cannot be created', async () => {
    await rejects(as(u, `insert into public.day_plans (user_id, plan_date) values ($1, '2027-03-12')`, [u]), /too far ahead/)
  })
})

describe('history and progress cannot be erased by a client', () => {
  let u
  beforeAll(async () => {
    u = await createUser(db, 'delete@example.com', 'America/New_York')
  })

  it('cannot delete a day plan at all (it would erase progress); removal is by cascade only', async () => {
    await day(db, u, TODAY)
    await rejects(as(u, `delete from public.day_plans where user_id = $1`, [u]), /permission denied/)
  })

  it('can delete an untouched task before the baseline exists', async () => {
    const o = await occurrence(db, u, TODAY, { title: 'composing' })
    expect(await affected(u, 'delete from public.task_occurrences where id = $1', [o.id])).toBe(1)
  })

  it('cannot delete a task with progress, partial or done', async () => {
    const half = await occurrence(db, u, TODAY, { title: 'half', completion: 0.5 })
    const done = await occurrence(db, u, TODAY, { title: 'done', completion: 1 })
    expect(await affected(u, 'delete from public.task_occurrences where id = $1', [half.id])).toBe(0)
    expect(await affected(u, 'delete from public.task_occurrences where id = $1', [done.id])).toBe(0)
  })

  it('after the baseline exists: an original-plan task is protected, a later-added untouched task is not', async () => {
    const original = await occurrence(db, u, TODAY, { title: 'original untouched' }) // created before the baseline (baseline stamped by the progress above? created now: check below)
    const baseline = await one(db, 'select baseline_at is not null as fixed from public.day_plans where user_id = $1 and plan_date = $2', [u, TODAY])
    expect(baseline.fixed).toBe(true) // progress above fixed it before this task existed...
    expect(original.in_original_plan).toBe(false) // ...so this one is a later addition

    const early = await createUser(db, 'delete2@example.com', 'America/New_York')
    const keep = await occurrence(db, early, TODAY, { title: 'in the original plan' })
    await db.query(`update public.day_plans set day_mode = 'busy' where user_id = $1`, [early]) // baseline fixed after `keep` existed
    expect((await one(db, 'select in_original_plan from public.task_occurrences where id = $1', [keep.id])).in_original_plan).toBe(true)
    expect(await affected(early, 'delete from public.task_occurrences where id = $1', [keep.id])).toBe(0) // protected: soft-remove instead
    expect(await affected(u, 'delete from public.task_occurrences where id = $1', [original.id])).toBe(1) // later addition, untouched
  })

  it('soft-removing (set aside as removed) is allowed for an original-plan task', async () => {
    const early = await createUser(db, 'delete3@example.com', 'America/New_York')
    const keep = await occurrence(db, early, TODAY, { title: 'to soft-remove' })
    await db.query(`update public.day_plans set day_mode = 'busy' where user_id = $1`, [early])
    expect(await affected(early, `update public.task_occurrences set plan_state = 'excluded', excluded_reason = 'removed' where id = $1`, [keep.id])).toBe(1)
    expect(await count(db, 'task_occurrences', 'id = $1', [keep.id])).toBe(1)
  })

  it('deleting a template keeps its history; deleting the account removes everything', async () => {
    const v = await createUser(db, 'history@example.com', 'America/New_York')
    const t = await template(db, v, { title: 'Routine' })
    await occurrence(db, v, TODAY, { title: 'Routine', template_id: t.id, completion: 1 })
    expect(await affected(v, 'delete from public.task_templates where id = $1', [t.id])).toBe(1)
    expect(await rows(v, 'select title, template_id from public.task_occurrences')).toEqual([{ title: 'Routine', template_id: null }])
    await db.query('delete from auth.users where id = $1', [v])
    expect(await count(db, 'task_occurrences', 'user_id = $1', [v])).toBe(0)
  })
})

describe('end to end through the client: move a partly done task and suppress a deleted one', () => {
  it('records the move with a link, keeps the source\'s progress and the original plan, and survives a reopen', async () => {
    const u = await createUser(db, 'flow@example.com', 'America/New_York')
    const tpl = await template(db, u, { title: 'Report' })
    await as(u, `insert into public.day_plans (user_id, plan_date) values ($1, '${TODAY}')`, [u])
    const [report] = await rows(u, `insert into public.task_occurrences (user_id, plan_date, title, template_id) values ($1, '${TODAY}', 'Report', $2) returning id`, [u, tpl.id])
    const [other] = await rows(u, `insert into public.task_occurrences (user_id, plan_date, title) values ($1, '${TODAY}', 'Other') returning id`, [u])

    await as(u, 'update public.task_occurrences set completion = 0.5 where id = $1', [report.id]) // did half
    await as(u, `update public.task_occurrences set plan_state = 'excluded', excluded_reason = 'rescheduled' where id = $1`, [report.id]) // C2: partial may move
    await as(u, `insert into public.day_plans (user_id, plan_date) values ($1, '2026-03-13')`, [u])
    const [moved] = await rows(u, `insert into public.task_occurrences (user_id, plan_date, title, template_id, rescheduled_from_id) values ($1, '2026-03-13', 'Report', $2, $3) returning id, in_original_plan`, [u, tpl.id, report.id])
    expect(moved.in_original_plan).toBe(true) // that day has no baseline yet

    const src = (await rows(u, 'select completion, plan_state, excluded_reason, in_original_plan from public.task_occurrences where id = $1', [report.id]))[0]
    expect(Number(src.completion)).toBe(0.5)
    expect(src).toMatchObject({ plan_state: 'excluded', excluded_reason: 'rescheduled', in_original_plan: true })

    await rejects(as(u, `update public.task_occurrences set completion = 1, plan_state = 'excluded', excluded_reason = 'busy_day' where id = $1`, [other.id]), /task_occurrences_done_stays_active/)
    expect(await affected(u, `delete from public.task_occurrences where id = $1`, [report.id])).toBe(0) // progress: cannot be hard-deleted

    // today's figures from the same rows: original plan 2 tasks / 0.5 units; current plan 1 task / 0 units
    const figures = (await rows(u, `select count(*) filter (where in_original_plan) as original_n, sum(completion) filter (where in_original_plan) as original_units,
                                           count(*) filter (where plan_state = 'active') as current_n, sum(completion) filter (where plan_state = 'active') as current_units
                                      from public.task_occurrences where plan_date = '${TODAY}'`))[0]
    expect([figures.original_n, Number(figures.original_units), figures.current_n, Number(figures.current_units)]).toEqual([2, 0.5, 1, 0])
  })

  it('a task deleted before the baseline can be suppressed with the user\'s own template id', async () => {
    const u = await createUser(db, 'suppress@example.com', 'America/New_York')
    const tpl = await template(db, u)
    await as(u, `insert into public.day_plans (user_id, plan_date) values ($1, '${TODAY}')`, [u])
    const [o] = await rows(u, `insert into public.task_occurrences (user_id, plan_date, title, template_id) values ($1, '${TODAY}', 'x', $2) returning id`, [u, tpl.id])
    expect(await affected(u, 'delete from public.task_occurrences where id = $1', [o.id])).toBe(1)
    expect(await affected(u, `update public.day_plans set suppressed_template_ids = $2 where user_id = $1`, [u, `{${tpl.id}}`])).toBe(1)
    expect((await rows(u, 'select suppressed_template_ids from public.day_plans'))[0].suppressed_template_ids).toEqual([tpl.id])
    expect((await one(db, 'select baseline_at from public.day_plans where user_id = $1', [u])).baseline_at).toBeNull() // composing is not a revision
  })
})

describe('policy audit', () => {
  it('every planner table has RLS on, and policies only for authenticated users that reference auth.uid()', async () => {
    const { rows: policies } = await db.query(
      `select tablename, policyname, roles::text as roles, cmd, coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr
         from pg_policies where schemaname = 'public' and tablename in ('task_templates', 'day_plans', 'task_occurrences')`,
    )
    expect(policies.length).toBe(4 + 3 + 4)
    for (const p of policies) {
      expect(p.roles, p.policyname).toBe('{authenticated}')
      expect(p.expr, p.policyname).toMatch(/auth\.uid\(\)/)
    }
    const perTable = policies.reduce((acc, p) => ({ ...acc, [p.tablename]: [...(acc[p.tablename] ?? []), p.cmd].sort() }), {})
    expect(perTable).toEqual({
      task_templates: ['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
      day_plans: ['INSERT', 'SELECT', 'UPDATE'], // no DELETE: removal is by cascade only
      task_occurrences: ['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
    })
  })

  it('the authenticated role has no privilege that skips the policies (no table-wide UPDATE/INSERT)', async () => {
    for (const table of ['task_templates', 'day_plans', 'task_occurrences']) {
      for (const priv of ['insert', 'update']) {
        expect((await one(db, `select has_table_privilege('authenticated', 'public.${table}', '${priv}') as p`)).p, `${table} ${priv}`).toBe(false)
      }
    }
    expect((await one(db, `select has_table_privilege('authenticated', 'public.day_plans', 'delete') as p`)).p).toBe(false)
  })
})
