import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

// Minimal stand-in for the parts of Supabase that the migrations depend on:
// the anon/authenticated roles, auth.users, and auth.uid(). Real Supabase
// defines these itself; this only exists so the SQL can run in a plain
// Postgres engine (PGlite). It is NOT a substitute for testing on a real
// Supabase project.
const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`

export async function createDb() {
  const db = new PGlite()
  await db.exec(SUPABASE_STUBS)
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
  }
  return db
}

// TEST-ONLY: swaps the planner's single clock source (public.planner_now) for one
// that can be set per test, so date-window rules are deterministic. The production
// function is `select now()`; every rule that depends on time calls planner_now(),
// so the rules exercised here are the production rules with a controllable clock.
export async function useFixedClock(db, iso) {
  await db.exec(`
    create or replace function public.planner_now() returns timestamptz language sql stable as $$
      select coalesce(nullif(current_setting('planner.now', true), '')::timestamptz, now())
    $$;
  `)
  await setClock(db, iso)
}
export const setClock = (db, iso) => db.query(`select set_config('planner.now', $1, false)`, [iso])

// Runs `fn` as an API client: role `authenticated` with the given user id (or
// `anon` when userId is null), the way PostgREST would. Always resets after.
export async function asUser(db, userId, fn) {
  const role = userId ? 'authenticated' : 'anon'
  await db.exec(`set role ${role}`)
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? ''])
  try {
    return await fn(db)
  } finally {
    await db.exec('reset role')
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
  }
}

export async function createUser(db, email, timeZone = 'UTC') {
  const { rows } = await db.query('insert into auth.users (email) values ($1) returning id', [email])
  const id = rows[0].id
  if (timeZone !== 'UTC') await db.query('update public.profiles set timezone = $1 where id = $2', [timeZone, id])
  return id
}
