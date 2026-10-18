import { spawn, spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdtempSync, openSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Starts ONE real Arcloop Django server for the whole integration run: a throwaway SQLite file in the OS temp
// folder (never backend/db.sqlite3), no rate limiting, and the test-only clock header enabled (debug mode only).
// Each test creates its own users, so test files can run in parallel against it. Nothing here reads .env.
const PORT = Number(process.env.ARCLOOP_INTEGRATION_PORT ?? 8770)

export default async function setup(project) {
  const backendDir = resolve('backend')
  const python = [join(backendDir, '.venv', 'Scripts', 'python.exe'), join(backendDir, '.venv', 'bin', 'python')].find(existsSync)
  if (!python) throw new Error('The integration tests need the backend virtualenv: see "Backend (Django)" in the README.')

  const dir = mkdtempSync(join(tmpdir(), 'arcloop-integration-'))
  const env = {
    ...process.env,
    DJANGO_DEBUG: 'true',
    DJANGO_SECRET_KEY: '',
    ARCLOOP_TEST_CLOCK: '1',
    DJANGO_DB_PATH: join(dir, 'integration.sqlite3'),
    DJANGO_AUTH_THROTTLE: '100000/min',
  }
  const migrate = spawnSync(python, ['manage.py', 'migrate', '--noinput'], { cwd: backendDir, env, stdio: 'ignore' })
  if (migrate.status !== 0) throw new Error('Could not migrate the temporary integration database.')
  // ARCLOOP_INTEGRATION_LOG=<file> keeps the server's output, for diagnosing a failing run. Off by default.
  const logFile = process.env.ARCLOOP_INTEGRATION_LOG ? openSync(process.env.ARCLOOP_INTEGRATION_LOG, 'w') : null
  const server = spawn(python, ['manage.py', 'runserver', `127.0.0.1:${PORT}`, '--noreload'], { cwd: backendDir, env, stdio: logFile ? ['ignore', logFile, logFile] : 'ignore' })

  const base = `http://127.0.0.1:${PORT}/api/v1`
  let ready = false
  for (let i = 0; i < 120 && !ready; i += 1) {
    ready = await fetch(`${base}/auth/me/`).then(() => true, () => false)
    if (!ready) await new Promise((r) => setTimeout(r, 250))
  }
  if (!ready) {
    server.kill()
    throw new Error('The integration API did not start.')
  }
  project.provide('apiBase', base)

  return () => {
    server.kill()
    if (logFile !== null) closeSync(logFile)
    // The server may hold the file for a moment on Windows; a leftover temp file is harmless.
    setTimeout(() => rmSync(dir, { recursive: true, force: true }), 500).unref?.()
  }
}
