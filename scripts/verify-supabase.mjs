// Real-Supabase verification runner. Run ONLY against a dedicated, disposable TEST project.
//
//   1. Apply the three migrations to the test project, then run supabase/verification/schema_checks.sql
//      (see docs/SUPABASE_SETUP.md, "Verifying a test project").
//   2. In .env (git-ignored) set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for the TEST project, then:
//        ARCLOOP_TEST_PROJECT_REF=<the test project's ref> ARCLOOP_CONFIRM_TEST_PROJECT=yes \
//          node --env-file=.env scripts/verify-supabase.mjs
//
// What it does: signs up two throw-away test users (email confirmation must be OFF on the test project), checks
// real sign-in, wrong-password and sign-out behaviour, then runs the same service-level journey that is
// validated in PGlite (tests/support/serviceJourney.js) through the real client, PostgREST and Row Level
// Security: planning, editing, completing, moving, setting aside, Week and Progress, recurring tasks, returning
// after a missed day, reminders, persistence, cross-user isolation, and the column and date-window rules.
//
// Safety: it refuses to run unless the target project is named and confirmed (scripts/lib/verificationGuards.js),
// uses only the public anon key, never prints keys, tokens or passwords, and never deletes anything it did not
// create. Finished and moved tasks stay as protected history by design; delete the two test users in the
// dashboard (Authentication > Users) to remove everything this run created (rows cascade).
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { checkTarget, describeEnv, nodeMeetsRequirement } from './lib/verificationGuards.js'
import { createPlannerService } from '../src/services/planner/createPlannerService.js'
import { createReminderService } from '../src/services/reminders/createReminderService.js'
import { runServiceJourney } from '../tests/support/serviceJourney.js'

const target = checkTarget(process.env)

// --preflight: report readiness and contact nothing. Names and a status only; values are never printed.
if (process.argv.includes('--preflight')) {
  const nodeOk = nodeMeetsRequirement(process.versions.node)
  console.log('Arcloop verification preflight (local only: nothing is contacted)\n')
  console.log(`  Node ${process.versions.node}: ${nodeOk ? 'OK' : 'TOO OLD (needs 20.6 or later for --env-file)'}`)
  for (const { name, status } of describeEnv(process.env)) console.log(`  ${name}: ${status}`)
  if (target.ok) {
    console.log(`\nPreflight passed. The target would be project ${target.ref.slice(0, 4)}… (confirmed by you as a test project).`)
    console.log('Run again without --preflight to start the verification.')
  } else {
    console.log('\nNot ready:')
    for (const problem of target.problems) console.log(`  - ${problem}`)
  }
  process.exit(nodeOk && target.ok ? 0 : 2)
}

if (!target.ok) {
  console.error('Refusing to run. Nothing was contacted.\n')
  for (const problem of target.problems) console.error(`  - ${problem}`)
  console.error('\nSee docs/SUPABASE_SETUP.md ("Verifying a test project").')
  process.exit(2)
}

const url = process.env.VITE_SUPABASE_URL.trim()
const anonKey = process.env.VITE_SUPABASE_ANON_KEY.trim()
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const newClient = () => createClient(url, anonKey, clientOptions)
const sanitize = (e) => String(e?.message ?? e).replace(/\s+/g, ' ').slice(0, 200)

const runId = randomBytes(4).toString('hex')
const password = randomBytes(18).toString('base64url') // never printed
const emails = { a: `arcloop-verify-${runId}-a@example.com`, b: `arcloop-verify-${runId}-b@example.com` }
const results = []
const record = (name, ok, detail = '') => results.push({ name, ok, detail })

async function signUp(email) {
  const client = newClient()
  const { data, error } = await client.auth.signUp({ email, password })
  if (error) throw new Error(`sign-up failed: ${sanitize(error)}`)
  if (!data.session) throw new Error('sign-up succeeded but no session was returned: email confirmation is ON for this project. Turn it off for the test project (Authentication > Providers > Email) and run again.')
  return { client, userId: data.user.id }
}
const servicesFor = (client) => ({
  planner: createPlannerService({ getClient: () => client }),
  reminders: createReminderService({ getClient: () => client }),
})

console.log(`Arcloop real-Supabase verification (project ${target.ref.slice(0, 4)}…, confirmed as a test project by you)\n`)

try {
  const a = await signUp(emails.a)
  const b = await signUp(emails.b)
  record('sign up two test users and receive sessions', true)

  const anon = { client: newClient() }

  // --- authentication behaviour on the real auth service ---
  {
    const probe = newClient()
    const { error } = await probe.auth.signInWithPassword({ email: emails.a, password: `${password}-wrong` })
    record('a wrong password is rejected', Boolean(error), error ? '' : 'sign-in with a wrong password succeeded')
  }
  {
    await a.client.auth.signOut()
    const { data } = await a.client.from('task_templates').select('id')
    const signedOutSees = Array.isArray(data) ? data.length : 0
    record('after sign-out the user can read nothing', signedOutSees === 0)
    const { error } = await a.client.auth.signInWithPassword({ email: emails.a, password })
    record('signing back in works', !error, error ? sanitize(error) : '')
  }

  // --- the shared service-level journey ---
  const sa = servicesFor(a.client)
  const sb = servicesFor(b.client)
  const journey = await runServiceJourney({
    a: { ...sa, client: a.client, userId: a.userId },
    b: { ...sb, client: b.client, userId: b.userId },
    anon,
    reopenA: async () => {
      await a.client.auth.signOut()
      const fresh = newClient()
      const { error } = await fresh.auth.signInWithPassword({ email: emails.a, password })
      if (error) throw new Error(`sign-in failed: ${sanitize(error)}`)
      return servicesFor(fresh)
    },
  })
  results.push(...journey)
} catch (e) {
  record('run completed without an unexpected error', false, sanitize(e))
}

const failed = results.filter((r) => !r.ok)
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${!r.ok && r.detail ? `\n        ${r.detail}` : ''}`)
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed.`)
console.log(`Test users created by this run: ${emails.a}, ${emails.b}`)
console.log('Delete them in the dashboard (Authentication > Users) to remove everything this run created.')
process.exit(failed.length === 0 ? 0 : 1)
