// Starts the real Arcloop API for the Django browser tests: a fresh SQLite file inside e2e-django/.tmp (never
// backend/db.sqlite3), password-reset emails written to files there instead of being sent, and CORS opened
// only for the test frontend's origin. Playwright runs this as its webServer and stops it afterwards.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const API_PORT = process.env.E2E_API_PORT ?? '8100'
const WEB_ORIGIN = process.env.E2E_WEB_ORIGIN ?? 'http://127.0.0.1:5300'
const backendDir = resolve('backend')
const tmp = resolve('e2e-django', '.tmp')
const python = [join(backendDir, '.venv', 'Scripts', 'python.exe'), join(backendDir, '.venv', 'bin', 'python')].find(existsSync)
if (!python) {
  console.error('backend virtualenv not found; see "Backend (Django)" in the README')
  process.exit(2)
}

rmSync(tmp, { recursive: true, force: true })
mkdirSync(join(tmp, 'emails'), { recursive: true })
const env = {
  ...process.env,
  DJANGO_DEBUG: 'true',
  DJANGO_SECRET_KEY: '',
  DJANGO_DB_PATH: join(tmp, 'e2e.sqlite3'),
  DJANGO_EMAIL_BACKEND: 'django.core.mail.backends.filebased.EmailBackend',
  DJANGO_EMAIL_FILE_PATH: join(tmp, 'emails'),
  DJANGO_AUTH_THROTTLE: '10000/min',
  CORS_ALLOWED_ORIGINS: WEB_ORIGIN, // only the test frontend: a request from anywhere else must be refused
  FRONTEND_URL: WEB_ORIGIN,
}
const migrate = spawnSync(python, ['manage.py', 'migrate', '--noinput'], { cwd: backendDir, env, stdio: 'inherit' })
if (migrate.status !== 0) process.exit(migrate.status ?? 2)

const server = spawn(python, ['manage.py', 'runserver', `127.0.0.1:${API_PORT}`, '--noreload'], { cwd: backendDir, env, stdio: 'inherit' })
const stop = () => server.kill()
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
process.on('exit', stop)
server.on('exit', (code) => process.exit(code ?? 0))
