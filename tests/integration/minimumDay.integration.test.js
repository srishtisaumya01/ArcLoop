import { beforeAll, describe, expect, it } from 'vitest'
import { summarizeDay } from '../../src/utils/planner/index.js'
import { SERVICE_ERROR } from '../../src/services/planner/errors.js'
import { createPlannerService } from '../../src/services/planner/createPlannerService.js'
import { createPerson, createTestClient, createUser, createWorld, listRows, setClock } from './harness.js'

// Minimum Day through the real planner service and the real server: the label is saved and validated by the API, it never
// changes the full-plan figures, setting a task aside or moving it takes it out, and one person cannot touch another's.
let world
let seq = 0
beforeAll(() => {
  world = createWorld('2026-03-10T15:00:00Z') // Tuesday 11:00 in New York
})

const person = () => createPerson(world, `minimum-${(seq += 1)}@example.com`, 'America/New_York')
const TODAY = '2026-03-10'
const TOMORROW = '2026-03-11'
const rejection = async (promise) => {
  try {
    await promise
  } catch (e) {
    return e
  }
  throw new Error('expected a rejection')
}
async function dayWith(p, titles, date = TODAY) {
  for (const title of titles) await p.service.createTask(date, { title })
  const plan = await p.service.openDay(date)
  return plan.occurrences
}
const byTitle = (occurrences, title) => occurrences.find((o) => o.title === title)

describe('choosing a minimum', () => {
  it('saves up to three tasks and reads them back, leaving the full-plan figures alone', async () => {
    setClock(world, '2026-03-10T15:00:00Z')
    const p = await person()
    const tasks = await dayWith(p, ['Write', 'Walk', 'Read', 'Tidy'])
    const before = (await p.service.getDayPlan(TODAY)).summary
    const result = await p.service.setMinimum(TODAY, [byTitle(tasks, 'Write').id, byTitle(tasks, 'Walk').id])
    expect(result).toMatchObject({ count: 2, done: 0, status: 'open' })
    const plan = await p.service.getDayPlan(TODAY)
    expect(plan.occurrences.filter((o) => o.isMinimum).map((o) => o.title).sort()).toEqual(['Walk', 'Write'])
    expect(plan.minimum).toMatchObject({ count: 2, status: 'open' })
    expect(plan.summary).toEqual(before) // not a revision of the plan: same figures, no baseline
    expect(plan.day.baselineAt).toBeNull()
  })

  it('completing the minimum is reported separately and never completes the day', async () => {
    setClock(world, '2026-03-10T15:00:00Z')
    const p = await person()
    const tasks = await dayWith(p, ['One', 'Two', 'Three', 'Four'])
    const ids = ['One', 'Two'].map((t) => byTitle(tasks, t).id)
    await p.service.setMinimum(TODAY, ids)
    for (const id of ids) await p.service.setCompletion(id, 1)
    const plan = await p.service.getDayPlan(TODAY)
    expect(plan.minimum).toMatchObject({ count: 2, done: 2, status: 'complete' })
    expect(plan.summary.current).toMatchObject({ count: 4, done: 2, percent: 50 }) // the existing rule, unchanged
    expect(summarizeDay({ day: plan.day, occurrences: plan.occurrences.map((o) => ({ ...o, isMinimum: false })) }).current.percent).toBe(50)
    expect(plan.occurrences.filter((o) => o.completion === 0)).toHaveLength(2) // the other two are untouched
  })

  it('refuses a fourth task, a repeated task, and the server says no even if the client tried', async () => {
    setClock(world, '2026-03-10T15:00:00Z')
    const p = await person()
    const tasks = await dayWith(p, ['A', 'B', 'C', 'D'])
    const [a, b, c, d] = ['A', 'B', 'C', 'D'].map((t) => byTitle(tasks, t).id)
    expect((await rejection(p.service.setMinimum(TODAY, [a, b, c, d]))).code).toBe(SERVICE_ERROR.VALIDATION)
    expect((await rejection(p.service.setMinimum(TODAY, [a, a]))).code).toBe(SERVICE_ERROR.VALIDATION)
    await p.service.setMinimum(TODAY, [a, b, c])
    // Bypass the service: ask the API directly for a fourth.
    const api = world.users.get(p.userId).api
    const direct = await rejection(api.patch('/task-occurrences/', { is_minimum: true }, { query: { id: d } }))
    expect(direct.status).toBe(400)
    expect((await p.service.getDayPlan(TODAY)).minimum.count).toBe(3)
  })

  it('can be changed and cleared', async () => {
    setClock(world, '2026-03-10T15:00:00Z')
    const p = await person()
    const tasks = await dayWith(p, ['A', 'B', 'C', 'D'])
    const [a, b, c, d] = ['A', 'B', 'C', 'D'].map((t) => byTitle(tasks, t).id)
    await p.service.setMinimum(TODAY, [a, b, c])
    await p.service.setMinimum(TODAY, [a, d]) // swaps two for one, never exceeding three part-way
    expect((await p.service.getDayPlan(TODAY)).minimum.ids.sort()).toEqual([a, d].sort())
    await p.service.setMinimum(TODAY, [])
    expect((await p.service.getDayPlan(TODAY)).minimum).toMatchObject({ count: 0, status: 'none' })
  })
})

describe('how it behaves with the rest of the planner', () => {
  it('setting a chosen task aside takes it out of the minimum and does not put it back on restore', async () => {
    setClock(world, '2026-03-10T15:00:00Z')
    const p = await person()
    const tasks = await dayWith(p, ['Keep', 'Other'])
    const keep = byTitle(tasks, 'Keep').id
    await p.service.setMinimum(TODAY, [keep])
    await p.service.setAside(keep, 'busy_day')
    expect((await p.service.getDayPlan(TODAY)).minimum.count).toBe(0)
    expect((await rejection(p.service.setMinimum(TODAY, [keep]))).code).toBe(SERVICE_ERROR.CONFLICT) // not while it is set aside
    await p.service.restore(keep)
    expect((await p.service.getDayPlan(TODAY)).minimum.count).toBe(0) // nothing is re-chosen for the person
    await p.service.setMinimum(TODAY, [keep]) // but they can choose it again on purpose
    expect((await p.service.getDayPlan(TODAY)).minimum.count).toBe(1)
  })

  it('works alongside Busy and Rest days without changing the day mode or any other task', async () => {
    setClock(world, '2026-03-10T15:00:00Z')
    const p = await person()
    const tasks = await dayWith(p, ['Keep', 'Other'])
    await p.service.setDayMode(TODAY, 'busy')
    await p.service.setMinimum(TODAY, [byTitle(tasks, 'Keep').id])
    let plan = await p.service.getDayPlan(TODAY)
    expect(plan.day.dayMode).toBe('busy')
    expect(plan.occurrences.every((o) => o.planState === 'active' && o.completion === 0)).toBe(true) // nothing was set aside or done for them
    await p.service.setDayMode(TODAY, 'rest')
    plan = await p.service.getDayPlan(TODAY)
    expect(plan.minimum.count).toBe(1) // switching the day type does not touch the minimum
    expect(plan.summary.kind).toBe('rest')
  })

  it('moving a task to another day does not carry the label with it', async () => {
    setClock(world, '2026-03-10T15:00:00Z')
    const p = await person()
    const tasks = await dayWith(p, ['Move me'])
    const id = byTitle(tasks, 'Move me').id
    await p.service.setMinimum(TODAY, [id])
    await p.service.rescheduleOccurrence(id, TOMORROW)
    expect((await p.service.getDayPlan(TODAY)).minimum.count).toBe(0)
    const tomorrow = await p.service.getDayPlan(TOMORROW)
    expect(tomorrow.minimum.count).toBe(0)
    expect(tomorrow.occurrences).toHaveLength(1)
  })

  it('each day keeps its own minimum when you switch dates', async () => {
    setClock(world, '2026-03-10T15:00:00Z')
    const p = await person()
    const today = await dayWith(p, ['Today task'])
    await p.service.createTask(TOMORROW, { title: 'Tomorrow task' })
    const tomorrow = (await p.service.openDay(TOMORROW)).occurrences
    await p.service.setMinimum(TODAY, [today[0].id])
    expect((await p.service.getDayPlan(TOMORROW)).minimum.count).toBe(0)
    await p.service.setMinimum(TOMORROW, [tomorrow[0].id])
    expect((await p.service.getDayPlan(TODAY)).minimum.ids).toEqual([today[0].id])
    expect((await p.service.getDayPlan(TOMORROW)).minimum.ids).toEqual([tomorrow[0].id])
  })

  it('cannot be changed on a day that has left the editing window', async () => {
    setClock(world, '2026-03-10T15:00:00Z')
    const p = await person()
    const tasks = await dayWith(p, ['Old'])
    await p.service.setMinimum(TODAY, [tasks[0].id])
    setClock(world, '2026-03-20T15:00:00Z')
    expect((await rejection(p.service.setMinimum(TODAY, []))).code).toBe(SERVICE_ERROR.VALIDATION)
    expect((await p.service.getDayPlan(TODAY)).minimum.count).toBe(1) // still readable as history
  })
})

describe('isolation', () => {
  it('another person can neither see nor change your minimum', async () => {
    setClock(world, '2026-03-10T15:00:00Z')
    const alice = await person()
    const bob = await person()
    const tasks = await dayWith(alice, ['Private'])
    await alice.service.setMinimum(TODAY, [tasks[0].id])
    const bobApi = world.users.get(bob.userId).api
    const attempt = await bobApi.patch('/task-occurrences/', { is_minimum: false }, { query: { id: tasks[0].id } })
    expect(attempt.results).toEqual([])
    expect((await rejection(bob.service.setMinimum(TODAY, [tasks[0].id]))).code).toBeDefined()
    expect((await alice.service.getDayPlan(TODAY)).minimum.count).toBe(1)
    expect((await listRows(world, bob.userId, 'task-occurrences')).filter((o) => o.is_minimum)).toEqual([])
  })
})


describe('a save that is cut off part-way, against the real API and database', () => {
  // The connection drops on the Nth write to the occurrences, as a real network failure would; the writes before it really happened.
  async function personWithFlakyConnection(failOnWrite) {
    const state = { writes: 0, fail: false }
    const userId = await createUser(world, `minimum-flaky-${(seq += 1)}@example.com`, 'America/New_York')
    const client = createTestClient(world, {
      getUserId: () => userId,
      hooks: {
        before: async (query) => {
          if (state.fail && query.table === 'task_occurrences' && query.op === 'update' && (state.writes += 1) === failOnWrite) throw new Error('Failed to fetch')
        },
      },
    })
    const service = createPlannerService({ getClient: () => client, clock: () => Date.parse(world.clockIso) })
    return { userId, service, state }
  }

  it('says it was only partly saved, keeps a valid minimum, and a retry finishes it without creating or duplicating anything', async () => {
    setClock(world, '2026-03-10T15:00:00Z')
    const p = await personWithFlakyConnection(2)
    const tasks = await dayWith(p, ['A', 'B', 'C', 'D'])
    const [a, b, c, d] = ['A', 'B', 'C', 'D'].map((t) => byTitle(tasks, t).id)
    await p.service.setMinimum(TODAY, [a, b])
    const before = (await listRows(world, p.userId, 'task-occurrences')).length

    // Change [a, b] to [c, d]: clear a, clear b, set c, set d. The 2nd write fails after one was really saved.
    Object.assign(p.state, { writes: 0, fail: true })
    const e = await rejection(p.service.setMinimum(TODAY, [c, d]))
    expect(e.details.partial).toBe('minimum_partly_saved')
    expect(e.message).toMatch(/only partly saved.*choose again.*No tasks were changed/)
    const rows = await listRows(world, p.userId, 'task-occurrences')
    expect(rows).toHaveLength(before) // nothing created or removed
    const flagged = rows.filter((o) => o.is_minimum).map((o) => o.title)
    expect(flagged).toEqual(['B']) // a was cleared before the failure; b, c, d were not reached: still valid, never over the limit
    expect(rows.every((o) => o.plan_state === 'active' && o.completion === 0)).toBe(true) // no task changed

    // The connection is back: choosing again finishes the job.
    p.state.fail = false
    await p.service.setMinimum(TODAY, [c, d])
    const after = await listRows(world, p.userId, 'task-occurrences')
    expect(after).toHaveLength(before)
    expect(after.filter((o) => o.is_minimum).map((o) => o.title).sort()).toEqual(['C', 'D'])
    await p.service.setMinimum(TODAY, [c, d]) // and again: nothing changes
    expect((await listRows(world, p.userId, 'task-occurrences')).filter((o) => o.is_minimum)).toHaveLength(2)
    expect((await p.service.getDayPlan(TODAY)).minimum).toMatchObject({ count: 2, status: 'open' })
  })

  it('a cut-off before anything was written changes nothing and shows the ordinary error', async () => {
    setClock(world, '2026-03-10T15:00:00Z')
    const p = await personWithFlakyConnection(1)
    const tasks = await dayWith(p, ['A', 'B'])
    p.state.fail = true
    const e = await rejection(p.service.setMinimum(TODAY, [byTitle(tasks, 'A').id]))
    expect(e.details?.partial).toBeUndefined()
    expect(e.code).toBe(SERVICE_ERROR.NETWORK)
    expect((await listRows(world, p.userId, 'task-occurrences')).filter((o) => o.is_minimum)).toEqual([])
  })
})
