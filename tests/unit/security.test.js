// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

describe('secrets hygiene', () => {
  const sourceFiles = walk(join(root, 'src')).filter((f) => /\.(js|jsx)$/.test(f))

  // Comments may legitimately warn about these names; only executable code is checked.
  const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('never references a service-role key or database password in client code', () => {
    const offenders = sourceFiles.filter((f) => /service[_-]?role|db[_-]?password|DATABASE_URL/i.test(stripComments(readFileSync(f, 'utf8'))))
    expect(offenders).toEqual([])
  })

  it('only reads the documented VITE_ environment variables from the browser bundle', () => {
    const used = new Set()
    for (const f of sourceFiles) {
      for (const m of readFileSync(f, 'utf8').matchAll(/import\.meta\.env\??\.([A-Z0-9_]+)/g)) used.add(m[1])
    }
    const allowed = new Set(['VITE_API_BASE_URL', 'DEV', 'MODE'])
    expect([...used].filter((v) => !allowed.has(v))).toEqual([])
  })

  it('never reads the whole environment object, which would bundle every VITE_ variable in .env', () => {
    const whole = sourceFiles.filter((f) => /import\.meta\.env(?!\??\.[A-Z0-9_]+)/.test(stripComments(readFileSync(f, 'utf8'))))
    expect(whole).toEqual([])
  })

  it('keeps .env.example to placeholder, public-only values', () => {
    const lines = readFileSync(join(root, '.env.example'), 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'))
    // The variable is commented out by default (development has a default); anything set must be the one public address.
    for (const line of lines) {
      const [key, value] = line.split('=')
      expect(key).toBe('VITE_API_BASE_URL') // the only variable the browser bundle reads
      expect(value).toMatch(/^https?:\/\/(127\.0\.0\.1|localhost|your-)/) // a local address or an obvious placeholder, never a real host
    }
  })

  it('keeps backend/.env.example to placeholders and git-ignores the real backend files', () => {
    const example = readFileSync(join(root, 'backend', '.env.example'), 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'))
    expect(example).toEqual(['DJANGO_DEBUG=true']) // everything else is commented out: nothing secret can be copied from it
    const ignore = readFileSync(join(root, '.gitignore'), 'utf8').split('\n').map((l) => l.trim())
    for (const entry of ['backend/.env', 'backend/db.sqlite3', 'backend/.venv', 'sent_emails/']) expect(ignore).toContain(entry)
  })

  it('the API settings hold no secret: the key, mail password and database path come from the environment', () => {
    const settings = readFileSync(join(root, 'backend', 'config', 'settings.py'), 'utf8')
    expect(settings).toMatch(/SECRET_KEY = os\.environ\.get\('DJANGO_SECRET_KEY'/)
    expect(settings).toMatch(/EMAIL_HOST_PASSWORD = os\.environ\.get\(/)
    expect(settings).not.toMatch(/EMAIL_HOST_PASSWORD\s*=\s*['"][^'"]+['"]/)
  })

  it('git-ignores real env files but not the example', () => {
    const ignore = readFileSync(join(root, '.gitignore'), 'utf8').split('\n').map((l) => l.trim())
    expect(ignore).toContain('.env')
    expect(ignore).toContain('.env.*')
    expect(ignore).toContain('!.env.example')
  })

  it('does not ship a committed .env file (a local, git-ignored one is expected and fine)', () => {
    const present = readdirSync(root).filter((f) => /^\.env(\..+)?$/.test(f) && f !== '.env.example')
    const tracked = spawnSync('git', ['ls-files', '--', '.env', '.env.*'], { cwd: root, encoding: 'utf8' })
    if (tracked.status !== 0) {
      // Not a git checkout (for example a plain archive): there must be no .env file at all.
      expect(present).toEqual([])
      return
    }
    expect(tracked.stdout.split(/\r?\n/).filter((f) => f && f !== '.env.example')).toEqual([])
    // Whatever is present locally must be ignored by git, so it can never be staged by accident.
    for (const file of present) expect(spawnSync('git', ['check-ignore', '-q', file], { cwd: root }).status, `${file} must be git-ignored`).toBe(0)
  })
})
