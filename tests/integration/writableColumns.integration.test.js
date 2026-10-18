// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { WRITABLE } from '../../src/services/planner/mappers.js'
import { PLANNER_CONFIG } from '../../src/utils/planner/index.js'
import { manage } from './manage.js'

// The client lists which columns it may write (so it can never send a server-maintained one); the server lists
// which it accepts. They must be the same lists.
const run = () => {
  const result = manage('writable_fields')
  expect(result.status, result.stderr).toBe(0)
  return result.json()
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

  it('has the same Minimum Day limit on both sides', () => {
    expect(PLANNER_CONFIG.limits.minimumTasks).toBe(run().limits.minimum_tasks)
  })
})
