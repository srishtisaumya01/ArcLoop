// Runs the service-level journey (tests/support/serviceJourney.js, the same 23-step script written for the
// earlier Supabase plan) against a REAL running Arcloop Django API, through the real planner and reminder services and the
// Django client. Two users are registered over HTTP, so authentication, token handling, per-user isolation
// and every server-side planner rule are exercised end to end.
//
// Safe by construction: it starts its own server on localhost with a throwaway SQLite file in the OS temp
// folder (never backend/db.sqlite3), and deletes it afterwards. It reads no .env file and sends nothing
// anywhere else. Usage:  npm run verify:django      (needs the backend virtualenv, see the README)
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createApiClient } from '../src/services/api/apiClient.js'
import { createDjangoClient } from '../src/services/api/djangoClient.js'
import { createPlannerService } from '../src/services/planner/createPlannerService.js'
import { createReminderService } from '../src/services/reminders/createReminderService.js'
import { runServiceJourney } from '../tests/support/serviceJourney.js'

const PORT = Number(process.env.VERIFY_DJANGO_PORT ?? 8765)
const BASE = `http://127.0.0.1:${PORT}/api/v1`
const backendDir = resolve('backend')
const python = [join(backendDir, '.venv', 'Scripts', 'python.exe'), join(backendDir, '.venv', 'bin', 'python')].find(existsSync)
if (!python) {
  console.error('FAIL: backend virtualenv not found. See "Backend setup" in the README.')
  process.exit(2)
}

const dir = mkdtempSync(join(tmpdir(), 'arcloop-verify-'))
const env = {
  ...process.env,
  DJANGO_DEBUG: 'true',
  DJANGO_DB_PATH: join(dir, 'verify.sqlite3'),
  DJANGO_AUTH_THROTTLE: '1000/min',
  DJANGO_SECRET_KEY: '', // dev key; this server only lives for this run
}
const run = (args) => spawn(python, ['manage.py', ...args], { cwd: backendDir, env, stdio: ['ignore', 'pipe', 'pipe'] })
const finish = (server, code) => {
  server?.kill()
  setTimeout(() => {
    rmSync(dir, { recursive: true, force: true })
    process.exit(code)
  }, 300)
}

const migrate = run(['migrate', '--noinput'])
migrate.on('exit', async (code) => {
  if (code !== 0) return finish(null, 2)
  const server = run(['runserver', `127.0.0.1:${PORT}`, '--noreload'])
  let ready = false
  for (let i = 0; i < 60 && !ready; i += 1) {
    ready = await fetch(`${BASE}/auth/me/`).then(() => true, () => false)
    if (!ready) await new Promise((r) => setTimeout(r, 250))
  }
  if (!ready) {
    console.error('FAIL: the API did not start')
    return finish(server, 2)
  }

  const memoryStorage = () => {
    const data = new Map()
    return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) }
  }
  const person = async (email) => {
    const api = createApiClient({ baseUrl: BASE, storage: memoryStorage() })
    const client = createDjangoClient(api)
    const planner = createPlannerService({ getClient: () => client })
    const reminders = createReminderService({ getClient: () => client })
    return { api, client, planner, reminders, userId: undefined, email }
  }
  const signIn = async (p, password) => {
    p.api.setSession(await p.api.post('/auth/login/', { email: p.email, password }, { authenticated: false }))
    p.userId = p.api.getSession().user.id
  }
  const password = 'plum-ladder-orbit-42'
  let exitCode = 0
  try {
    const a = await person('journey-a@example.com')
    const b = await person('journey-b@example.com')
    for (const p of [a, b]) {
      p.api.setSession(await p.api.post('/auth/register/', { email: p.email, password }, { authenticated: false }))
      p.userId = p.api.getSession().user.id
      // New accounts default to UTC; the journey, like a real user, has a profile timezone.
      await p.api.patch('/profile/', { timezone: 'America/New_York' })
    }
    const anon = await person('nobody@example.com')
    const results = await runServiceJourney({
      a,
      b,
      anon,
      reopenA: async () => {
        await a.api.post('/auth/logout/')
        a.api.clearSession()
        await signIn(a, password)
        return a
      },
    })
    for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok || !r.detail ? '' : `  [${r.detail}]`}`)
    const failed = results.filter((r) => !r.ok).length
    console.log(`\n${results.length - failed} of ${results.length} steps passed against the local Django API (temporary SQLite database, removed afterwards).`)
    if (failed) exitCode = 1
  } catch (error) {
    console.error(`FAIL: ${String(error?.message ?? error).slice(0, 300)}`)
    exitCode = 1
  }
  finish(server, exitCode)
})
