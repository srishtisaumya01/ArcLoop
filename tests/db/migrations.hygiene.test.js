// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Static checks over the migration files. They do not run SQL; they guard the conventions
// that keep migrations safe to apply to a database that already holds data.
const DIR = join(process.cwd(), 'supabase', 'migrations')
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
const strip = (sql) => sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
const read = (f) => strip(readFileSync(join(DIR, f), 'utf8'))

describe('migration files', () => {
  it('are named <14-digit timestamp>_<snake_case>.sql, unique and in order', () => {
    for (const f of files) expect(f).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/)
    const stamps = files.map((f) => f.slice(0, 14))
    expect(new Set(stamps).size).toBe(stamps.length)
    expect([...stamps].sort()).toEqual(stamps)
  })

  it('the planner migration comes after the profiles migration it depends on', () => {
    expect(files.indexOf('20261017000000_create_profiles.sql')).toBeGreaterThanOrEqual(0)
    expect(files.indexOf('20261017000000_create_profiles.sql')).toBeLessThan(files.indexOf('20261017100000_create_planner.sql'))
  })

  it('contain no destructive statements (no drops, truncates, deletes or column removals)', () => {
    const destructive = /\bdrop\s+(table|schema|column|policy|trigger|function|index|type|constraint)\b|\btruncate\b|\bdelete\s+from\b|\balter\s+table\b[^;]*\bdrop\b/i
    for (const f of files) expect(destructive.test(read(f)), f).toBe(false)
  })

  it('the planner migration is purely additive: it creates objects and alters none of the earlier ones', () => {
    const sql = read('20261017100000_create_planner.sql')
    const altered = [...sql.matchAll(/\balter\s+table\s+(?:if\s+exists\s+)?([\w.]+)/gi)].map((m) => m[1])
    expect(altered.every((t) => /^public\.(task_templates|day_plans|task_occurrences)$/.test(t))).toBe(true)
    // No statement may modify the existing profiles table or its rows (referencing it in a foreign key is fine).
    expect(sql).not.toMatch(/^\s*(alter\s+table|update|insert\s+into|delete\s+from)\s+(only\s+)?public\.profiles\b/im)
  })

  it('enable RLS on every table they create', () => {
    for (const f of files) {
      const sql = read(f)
      const created = [...sql.matchAll(/create\s+table\s+(public\.\w+)/gi)].map((m) => m[1])
      for (const t of created) {
        expect(sql, `${f}: ${t}`).toMatch(new RegExp(`alter\\s+table\\s+${t.replace('.', '\\.')}\\s+enable\\s+row\\s+level\\s+security`, 'i'))
        expect(sql, `${f}: ${t}`).toMatch(new RegExp(`revoke\\s+all\\s+on\\s+table\\s+${t.replace('.', '\\.')}\\s+from[^;]*anon`, 'i'))
      }
    }
  })

  it('mention no service-role key, secret or connection string', () => {
    for (const f of files) expect(readFileSync(join(DIR, f), 'utf8'), f).not.toMatch(/service[_-]?role|sb_secret|postgres(ql)?:\/\/|password\s*=/i)
  })

  it('every SECURITY DEFINER function pins an empty search_path', () => {
    for (const f of files) {
      for (const m of read(f).matchAll(/create\s+function[\s\S]*?\$\$[\s\S]*?\$\$;/gi)) {
        if (/security\s+definer/i.test(m[0])) expect(m[0], f).toMatch(/set\s+search_path\s*=\s*''/i)
      }
    }
  })
})
