// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { WRITABLE } from '../../src/services/planner/mappers.js'

// The client lists which columns it may write (so it can never send a server-maintained one); the server lists
// which it accepts. They must be the same lists.
const backendDir = resolve('backend')
const python = [join(backendDir, '.venv', 'Scripts', 'python.exe'), join(backendDir, '.venv', 'bin', 'python')].find(existsSync)
const run = () => {
  const result = spawnSync(python, ['manage.py', 'writable_fields'], { cwd: backendDir, env: { ...process.env, DJANGO_DEBUG: 'true', DJANGO_SECRET_KEY: '' }, encoding: 'utf8' })
  expect(result.status, result.stderr).toBe(0)
  return JSON.parse(result.stdout)
}
const sorted = (list) => [...list].sort()

describe('writable columns match between the client and the API', () => {
  it('has identical column lists for every insert and update', () => {
    const server = run()
    expect(sorted(WRITABLE.templateInsert)).toEqual(server.task_templates.insert)
    expect(sorted(WRITABLE.templateUpdate)).toEqual(server.task_templates.update)
    expect(sorted(WRITABLE.dayInsert)).toEqual(server.day_plans.insert)
    expect(sorted(WRITABLE.dayUpdate)).toEqual(server.day_plans.update)
    expect(sorted(WRITABLE.occurrenceInsert)).toEqual(server.task_occurrences.insert)
    expect(sorted(WRITABLE.occurrenceUpdate)).toEqual(server.task_occurrences.update)
  })
})
