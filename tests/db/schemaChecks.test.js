import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb } from './harness.js'

// Tests the READ-ONLY verification SQL that is run on a real project (supabase/verification/schema_checks.sql)
// against the three migrations in PGlite, so the checks themselves are known to be correct. This is not a
// verification of any hosted project: only running the file there is.
const SQL = readFileSync(join(process.cwd(), 'supabase', 'verification', 'schema_checks.sql'), 'utf8')

let db
beforeAll(async () => {
  db = await createDb()
}, 60000)
afterAll(async () => {
  await db?.close()
})

const run = async () => (await db.query(SQL)).rows
const failures = (rows) => rows.filter((r) => r.status === 'FAIL').map((r) => `${r.check_name} ${r.detail}`.trim())

describe('schema verification SQL (against the migrations, in PGlite)', () => {
  it('passes everything on a database built from the migrations, with exactly four items to review', async () => {
    const rows = await run()
    expect(failures(rows)).toEqual([])
    const review = rows.filter((r) => r.status === 'REVIEW')
    expect(review.map((r) => r.check_name).sort()).toEqual([
      'REVIEW helper: public.planner_max_active_templates()',
      'REVIEW helper: public.planner_max_occurrences_per_day()',
      'REVIEW helper: public.planner_valid_weekdays(smallint[])',
      'REVIEW helper: public.reminder_weekdays_valid(smallint[])',
    ])
    // The setup guide promises exactly these numbers (docs/SUPABASE_SETUP.md section 6, step C).
    expect(rows.length).toBe(133)
    expect(rows.filter((r) => r.status === 'PASS').length).toBe(129)
    const guide = readFileSync(join(process.cwd(), 'docs', 'SUPABASE_SETUP.md'), 'utf8')
    expect(guide).toContain('133 rows = 129 PASS, 4 REVIEW, 0 FAIL')
    for (const row of review) expect(guide).toContain(row.check_name.replace('REVIEW helper: ', ''))
  })

  it('is read-only: it changes nothing', async () => {
    const before = (await db.query(`select (select count(*) from pg_class where relnamespace = 'public'::regnamespace) as objects, (select count(*) from pg_policies) as policies`)).rows[0]
    await run()
    const after = (await db.query(`select (select count(*) from pg_class where relnamespace = 'public'::regnamespace) as objects, (select count(*) from pg_policies) as policies`)).rows[0]
    expect(after).toEqual(before)
  })

  // The checks must actually fail when something is wrong. Each fault is applied inside a transaction and rolled back.
  const faults = [
    ['row level security switched off', 'alter table public.task_occurrences disable row level security', 'row level security enabled: task_occurrences'],
    ['a policy missing', 'drop policy "Users read their own reminder preferences" on public.reminder_preferences', 'policy count: reminder_preferences expected 4, found 3'],
    ['anon granted table access', 'grant select on public.task_reminders to anon', 'anon has no privilege on table: task_reminders'],
    ['clients allowed to write a server-set column', 'grant update (completed_at) on public.task_occurrences to authenticated', 'clients cannot write task_occurrences.completed_at insert,update'],
    ['a trigger function callable through the API', 'grant execute on function public.task_occurrences_guard() to anon', 'trigger function not callable through the API: public.task_occurrences_guard()'],
    ['a constraint missing', 'alter table public.task_templates drop constraint task_templates_once_single_day', 'constraint exists: task_templates_once_single_day'],
    ['an index missing', 'drop index public.task_reminders_user_date_idx', 'index exists: task_reminders_user_date_idx'],
    ['a trigger disabled', 'alter table public.task_reminders disable trigger task_reminders_before_write', 'trigger exists and is enabled: task_reminders_before_write'],
    ['the test clock left in place', `create or replace function public.planner_now() returns timestamptz language sql stable as $$ select current_setting('planner.now')::timestamptz $$`, 'planner_now() is the plain production clock (no test override)'],
    ['an app helper exposed to anon', 'grant execute on function public.planner_today(uuid) to anon', 'app helper callable by signed-in users only: public.planner_today(uuid)'],
  ]
  for (const [name, sql, expected] of faults) {
    it(`reports FAIL when ${name}`, async () => {
      await db.exec('begin')
      try {
        await db.exec(sql)
        expect(failures(await run())).toEqual([expected])
      } finally {
        await db.exec('rollback')
      }
      expect(failures(await run())).toEqual([]) // and the database is back to normal
    })
  }
})
