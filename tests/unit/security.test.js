// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

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

  it('only reads VITE_SUPABASE_* environment variables from the browser bundle', () => {
    const used = new Set()
    for (const f of sourceFiles) {
      for (const m of readFileSync(f, 'utf8').matchAll(/import\.meta\.env\.([A-Z0-9_]+)/g)) used.add(m[1])
    }
    const allowed = new Set(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'DEV'])
    expect([...used].filter((v) => !allowed.has(v))).toEqual([])
  })

  it('keeps .env.example to placeholder, public-only values', () => {
    const lines = readFileSync(join(root, '.env.example'), 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#'))
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) {
      const [key, value] = line.split('=')
      expect(key).toMatch(/^VITE_SUPABASE_(URL|ANON_KEY)$/)
      expect(value).toMatch(/your-/)
    }
  })

  it('git-ignores real env files but not the example', () => {
    const ignore = readFileSync(join(root, '.gitignore'), 'utf8').split('\n').map((l) => l.trim())
    expect(ignore).toContain('.env')
    expect(ignore).toContain('.env.*')
    expect(ignore).toContain('!.env.example')
  })

  it('does not ship a committed .env file', () => {
    expect(readdirSync(root).filter((f) => /^\.env(\..+)?$/.test(f) && f !== '.env.example')).toEqual([])
  })
})
