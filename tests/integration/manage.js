import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Runs a Django management command with the backend virtualenv and returns its output. For tests that compare something
// the frontend keeps its own copy of (column lists, cookie names) or the server's timezone database against the frontend.
const backendDir = resolve('backend')
const python = [join(backendDir, '.venv', 'Scripts', 'python.exe'), join(backendDir, '.venv', 'bin', 'python')].find(existsSync)

export function manage(command, { maxBuffer = 1024 * 1024 } = {}) {
  if (!python) throw new Error('The backend virtualenv is needed: see "Backend (Django)" in the README.')
  const result = spawnSync(python, ['manage.py', command], { cwd: backendDir, env: { ...process.env, DJANGO_DEBUG: 'true', DJANGO_SECRET_KEY: '' }, encoding: 'utf8', maxBuffer })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, json: () => JSON.parse(result.stdout) }
}
