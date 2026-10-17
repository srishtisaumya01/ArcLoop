// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// Static checks on how the planner service layer is built and used.
const SRC = join(process.cwd(), 'src')
const walk = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]))
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '')
const files = walk(SRC).filter((f) => /\.(js|jsx)$/.test(f))
const plannerServiceFiles = files.filter((f) => relative(SRC, f).replace(/\\/g, '/').startsWith('services/planner/'))

describe('planner services', () => {
  it('exist in the expected shape', () => {
    expect(plannerServiceFiles.map((f) => relative(SRC, f).replace(/\\/g, '/')).sort()).toEqual([
      'services/planner/createPlannerService.js', 'services/planner/errors.js', 'services/planner/index.js', 'services/planner/mappers.js',
    ])
  })

  // Date.now() is allowed: it is only the default of the injectable `clock` (tests pass a fixed one).
  it('import no React, UI, browser storage or network code of their own', () => {
    const forbidden = /from\s+['"](react|react-dom|@mui\/[^'"]*|lucide-react|react-router-dom)['"]|\blocalStorage\b|\bsessionStorage\b|\bfetch\s*\(|\bdocument\b|\bwindow\b|import\.meta/
    expect(plannerServiceFiles.filter((f) => forbidden.test(strip(readFileSync(f, 'utf8'))))).toEqual([])
  })

  it('only the factory\'s entry point touches the shared Supabase client, and it does so lazily', () => {
    const importers = plannerServiceFiles.filter((f) => /supabaseClient\.js/.test(strip(readFileSync(f, 'utf8'))))
    expect(importers.map((f) => relative(SRC, f).replace(/\\/g, '/'))).toEqual(['services/planner/index.js'])
    expect(strip(readFileSync(join(SRC, 'services/planner/index.js'), 'utf8'))).toMatch(/getClient:\s*\(\)\s*=>\s*supabase/)
  })

  it('never use a service-role key or a database password', () => {
    expect(plannerServiceFiles.filter((f) => /service[_-]?role|db[_-]?password|DATABASE_URL/i.test(strip(readFileSync(f, 'utf8'))))).toEqual([])
  })
})

describe('database access stays inside the services layer', () => {
  it('no component, page, hook or context imports the Supabase client object (only the isSupabaseConfigured flag is allowed)', () => {
    const outside = files.filter((f) => !relative(SRC, f).replace(/\\/g, '/').startsWith('services/'))
    const offenders = []
    for (const f of outside) {
      for (const m of strip(readFileSync(f, 'utf8')).matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]*supabaseClient\.js['"]/g)) {
        const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)
        if (names.some((n) => n !== 'isSupabaseConfigured')) offenders.push(`${relative(SRC, f)}: ${names.join(', ')}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('nothing outside the services layer calls the query builder directly', () => {
    const outside = files.filter((f) => !relative(SRC, f).replace(/\\/g, '/').startsWith('services/'))
    expect(outside.filter((f) => /\.from\(\s*['"](task_templates|day_plans|task_occurrences|profiles)['"]/.test(strip(readFileSync(f, 'utf8'))))).toEqual([])
  })

  it('the planner service is not used by the UI yet (this phase builds no UI)', () => {
    const outside = files.filter((f) => !relative(SRC, f).replace(/\\/g, '/').startsWith('services/planner/'))
    expect(outside.filter((f) => /services\/planner/.test(strip(readFileSync(f, 'utf8'))))).toEqual([])
  })
})
