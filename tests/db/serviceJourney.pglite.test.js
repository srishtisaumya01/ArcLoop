import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPlannerService } from '../../src/services/planner/createPlannerService.js'
import { createReminderService } from '../../src/services/reminders/createReminderService.js'
import { createPgliteClient } from '../support/pgliteSupabase.js'
import { runServiceJourney } from '../support/serviceJourney.js'
import { createDb, createUser, useFixedClock } from './harness.js'
import { CLOCK } from './plannerSeed.js'

// Validates the service-level journey SCRIPT itself (tests/support/serviceJourney.js) against the migrations in
// PGlite, so that when the same script runs against a real Supabase test project, a failure points at a real
// difference in that environment and not at a bug in the script. This is not a real-Supabase verification.
let db
beforeAll(async () => {
  db = await createDb()
  await useFixedClock(db, CLOCK)
}, 60000)
afterAll(async () => {
  await db?.close()
})

const session = (userId, getUserId = () => userId) => {
  const client = createPgliteClient(db, { getUserId })
  const clock = () => Date.parse(CLOCK)
  return { client, userId, planner: createPlannerService({ getClient: () => client, clock }), reminders: createReminderService({ getClient: () => client, clock }) }
}

describe('service-level journey script', () => {
  it('passes every step against the migrations', async () => {
    const aId = await createUser(db, 'journey-a@example.com', 'America/New_York')
    const bId = await createUser(db, 'journey-b@example.com', 'America/New_York')
    const results = await runServiceJourney({
      a: session(aId),
      b: session(bId),
      anon: session(null, () => null),
      reopenA: async () => session(aId),
    })
    const failed = results.filter((r) => !r.ok)
    expect(failed.map((r) => `${r.name}: ${r.detail}`)).toEqual([])
    expect(results.length).toBe(23)

    // The setup guide shows the expected runner output; it must list exactly these steps, in this order, plus the
    // four sign-in checks that scripts/verify-supabase.mjs records itself.
    const guide = readFileSync(join(process.cwd(), 'docs', 'SUPABASE_SETUP.md'), 'utf8')
    const block = guide.split('<!-- expected-runner-output -->')[1].split('<!-- /expected-runner-output -->')[0]
    const documented = block.split(/\r?\n/).filter((line) => line.startsWith('PASS  ')).map((line) => line.slice('PASS  '.length))
    const runnerSource = readFileSync(join(process.cwd(), 'scripts', 'verify-supabase.mjs'), 'utf8')
    const ownChecks = documented.slice(0, 4)
    for (const name of ownChecks) expect(runnerSource, name).toContain(name)
    expect(documented.slice(4)).toEqual(results.map((r) => r.name))
    expect(guide).toContain('27 lines, all PASS')
    expect(documented.length).toBe(27)
  }, 120000)

  it('reports failures (it can fail): a broken isolation rule is caught', async () => {
    const aId = await createUser(db, 'journey-c@example.com', 'America/New_York')
    const bId = await createUser(db, 'journey-d@example.com', 'America/New_York')
    // User B is (wrongly) the same person as A, so every isolation step must fail.
    const results = await runServiceJourney({ a: session(aId), b: session(aId, () => aId), anon: session(null, () => null), reopenA: async () => session(aId) })
    const failed = results.filter((r) => !r.ok).map((r) => r.name)
    expect(failed).toEqual(expect.arrayContaining(['another user sees none of this data', 'another user cannot read, change or delete this user\'s rows']))
    expect(bId).toBeTruthy()
  }, 120000)
})
