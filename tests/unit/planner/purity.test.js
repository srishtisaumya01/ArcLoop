// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// The planner is pure logic: it must not reach for React, the API, storage, the
// network, the DOM, randomness or the system clock. Time arrives as an argument.
const DIR = join(process.cwd(), 'src', 'utils', 'planner')
const files = readdirSync(DIR).filter((f) => f.endsWith('.js'))
// Comments and import/export specifiers are removed first, so a module path such as
// './window.js' (the editing window) is not mistaken for the browser's `window`.
const strip = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/.*$/gm, '')
    .replace(/(from\s+)(['"])[^'"]*\2/g, '$1""')

describe('planner purity', () => {
  it('has the expected modules', () => {
    for (const f of ['progress.js', 'recurrence.js', 'localDates.js', 'timeZones.js', 'reschedule.js', 'dayModes.js', 'snapshots.js', 'weekly.js', 'workload.js', 'index.js']) {
      expect(files).toContain(f)
    }
  })

  it('imports only other planner modules', () => {
    const offenders = []
    const comments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    for (const f of files) {
      for (const m of comments(readFileSync(join(DIR, f), 'utf8')).matchAll(/(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/g)) {
        if (!m[1].startsWith('./')) offenders.push(`${f}: ${m[1]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('does not use the clock, randomness, storage, network or the DOM', () => {
    const forbidden = /\bDate\.now\s*\(|new Date\s*\(\s*\)|Math\.random|\blocalStorage\b|\bsessionStorage\b|\bfetch\s*\(|\bXMLHttpRequest\b|\bwindow\b|\bdocument\b|\bnavigator\b|process\.env|import\.meta/
    const offenders = files.filter((f) => forbidden.test(strip(readFileSync(join(DIR, f), 'utf8'))))
    expect(offenders).toEqual([])
  })

  it('contains no streak concept (D9)', () => {
    const offenders = files.filter((f) => /streak/i.test(strip(readFileSync(join(DIR, f), 'utf8'))))
    expect(offenders).toEqual([])
  })
})
