// Runs the Django test suite (backend/tests) with the backend virtualenv's Python. The suite uses its own
// throwaway database and never touches backend/db.sqlite3. `npm run test:backend`.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const backendDir = resolve('backend')
const python = [join(backendDir, '.venv', 'Scripts', 'python.exe'), join(backendDir, '.venv', 'bin', 'python')].find(existsSync)
if (!python) {
  console.error('backend virtualenv not found: see "Backend (Django)" in the README')
  process.exit(2)
}
const result = spawnSync(python, ['manage.py', 'test', 'tests', ...process.argv.slice(2)], {
  cwd: backendDir,
  env: { ...process.env, DJANGO_DEBUG: 'true' },
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
