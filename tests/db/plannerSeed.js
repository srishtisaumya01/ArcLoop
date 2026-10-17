import { expect } from 'vitest'

// Helpers for the planner database tests. They run as the database owner, so
// they bypass RLS and column grants; use them to ARRANGE data, then use asUser()
// from harness.js to ACT as an API client.

export const TODAY = '2026-03-10' // fixed clock: 2026-03-10T15:00:00Z, New York is on EDT
export const CLOCK = '2026-03-10T15:00:00Z'

export async function insert(db, table, row) {
  const keys = Object.keys(row)
  const placeholders = keys.map((_, i) => `$${i + 1}`)
  const { rows } = await db.query(
    `insert into public.${table} (${keys.join(', ')}) values (${placeholders.join(', ')}) returning *`,
    keys.map((k) => row[k]),
  )
  return rows[0]
}

export const template = (db, userId, overrides = {}) =>
  insert(db, 'task_templates', {
    user_id: userId,
    title: 'Walk',
    recurrence: 'daily',
    starts_on: '2026-01-01',
    ...overrides,
  })

export async function day(db, userId, planDate = TODAY) {
  await db.query('insert into public.day_plans (user_id, plan_date) values ($1, $2) on conflict do nothing', [userId, planDate])
}

// Inserts an occurrence (creating its day first). Pass `completion` / `plan_state` etc. to arrange state.
export async function occurrence(db, userId, planDate = TODAY, overrides = {}) {
  await day(db, userId, planDate)
  return insert(db, 'task_occurrences', { user_id: userId, plan_date: planDate, title: 'Task', ...overrides })
}

export const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0]
export const count = async (db, table, where = 'true', params = []) =>
  Number((await one(db, `select count(*) as n from public.${table} where ${where}`, params)).n)
export const rejects = (promise, pattern) => expect(promise).rejects.toThrow(pattern)
