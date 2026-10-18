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

  it('only the factory\'s entry point touches the shared data client (through the backend module), and it does so lazily', () => {
    const importers = plannerServiceFiles.filter((f) => /backend\.js|api\/(apiClient|djangoClient)\.js/.test(strip(readFileSync(f, 'utf8'))))
    expect(importers.map((f) => relative(SRC, f).replace(/\\/g, '/'))).toEqual(['services/planner/index.js'])
    const entry = strip(readFileSync(join(SRC, 'services/planner/index.js'), 'utf8'))
    expect(entry).toMatch(/from\s+['"]\.\.\/backend\.js['"]/) // never the API client directly: one module creates it
    expect(entry).toMatch(/getClient:\s*\(\)\s*=>\s*dataClient/)
  })

  it('never use a service-role key or a database password', () => {
    expect(plannerServiceFiles.filter((f) => /service[_-]?role|db[_-]?password|DATABASE_URL/i.test(strip(readFileSync(f, 'utf8'))))).toEqual([])
  })
})

describe('database access stays inside the services layer', () => {
  it('no component, page, hook or context imports a client object (only the configuration flags are allowed)', () => {
    const outside = files.filter((f) => !relative(SRC, f).replace(/\\/g, '/').startsWith('services/'))
    const flags = new Set(['isBackendConfigured'])
    const offenders = []
    for (const f of outside) {
      const text = strip(readFileSync(f, 'utf8'))
      for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]*backend\.js['"]/g)) {
        const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)
        if (names.some((n) => !flags.has(n))) offenders.push(`${relative(SRC, f)}: ${names.join(', ')}`)
      }
      // The API client and the Django adapter are reached only through the services.
      if (/from\s*['"][^'"]*services\/api\//.test(text)) offenders.push(`${relative(SRC, f)}: services/api`)
    }
    expect(offenders).toEqual([])
  })

  it('nothing outside the services layer calls the query builder directly', () => {
    const outside = files.filter((f) => !relative(SRC, f).replace(/\\/g, '/').startsWith('services/'))
    expect(outside.filter((f) => /\.from\(\s*['"](task_templates|day_plans|task_occurrences|profiles)['"]/.test(strip(readFileSync(f, 'utf8'))))).toEqual([])
  })

  it('code outside the service reaches it only through its entry point, and only from hooks', () => {
    const outside = files.filter((f) => !relative(SRC, f).replace(/\\/g, '/').startsWith('services/planner/'))
    const users = outside.filter((f) => /services\/planner/.test(strip(readFileSync(f, 'utf8'))))
    expect(users.map((f) => relative(SRC, f).replace(/\\/g, '/'))).toEqual(['hooks/useCalendarExport.js', 'hooks/useDayPlan.js', 'hooks/useProgressOverview.js', 'hooks/useRecoveryStatus.js', 'hooks/useRecurringTasks.js', 'hooks/useWeekOverview.js'])
    for (const f of users) expect(strip(readFileSync(f, 'utf8'))).not.toMatch(/services\/planner\/(?!index\.js)/)
  })
})
