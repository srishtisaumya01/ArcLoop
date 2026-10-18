import { beforeAll, describe, expect, it } from 'vitest'
import { createPlannerService } from '../../src/services/planner/createPlannerService.js'
import { SERVICE_ERROR } from '../../src/services/planner/errors.js'
import { editableRange } from '../../src/utils/planner/index.js'
import { createPerson, createTestClient, createUser, createWorld, listRows, setClock } from './harness.js'

// Undo through the real planner service, the real API and a real database: completion Undo (conditional write), moves and their
// Undo for one-off and repeating tasks, and the date and timezone boundaries. Chosen cases, not a proof for every zone and date.
let world
let seq = 0
beforeAll(() => {
  world = createWorld('2026-03-10T15:00:00Z') // Tuesday 11:00 in New York, Wednesday 04:00 in Auckland
})

const TODAY = '2026-03-10'
const person = (timeZone = 'America/New_York') => createPerson(world, `undo-${(seq += 1)}@example.com`, timeZone)
const rejection = async (promise) => {
  try {
    await promise
  } catch (e) {
    return e
  }
  throw new Error('expected a rejection')
}
async function task(p, title, date = TODAY) {
  await p.service.createTask(date, { title })
  return (await p.service.openDay(date)).occurrences.find((o) => o.title === title)
}
const rowOf = async (p, id) => (await listRows(world, p.userId, 'task-occurrences')).find((o) => o.id === id)
const activeOn = async (p, date) => (await p.service.getDayPlan(date)).occurrences.filter((o) => o.planState === 'active').map((o) => o.title)

describe('completion Undo', () => {
  it('puts a finished task back to not done, with no completion time, and the day figure follows', async () => {
    setClock(world, '2026-03-10T15:00:00Z')
    const p = await person()
    const walk = await task(p, 'Walk')
    await task(p, 'Read')
    await p.service.setCompletion(walk.id, 1)
    expect((await p.service.getDayPlan(TODAY)).summary.current.percent).toBe(50)
    const result = await p.service.undoCompletion(walk.id, { from: 1, to: 0 })
    expect(result.occurrence).toMatchObject({ completion: 0, completedAt: null })
    expect(await rowOf(p, walk.id)).toMatchObject({ completion: 0, completed_at: null })
    expect((await p.service.getDayPlan(TODAY)).summary.current.percent).toBe(0)
  })

  it('restores a partly done task to partly done, not to not done', async () => {
    setClock(world, '2026-03-10T15:00:00Z')
    const p = await person()
    const walk = await task(p, 'Walk')
    await p.service.setCompletion(walk.id, 0.5)
    await p.service.setCompletion(walk.id, 1)
    await p.service.undoCompletion(walk.id, { from: 1, to: 0.5 })
    expect(await rowOf(p, walk.id)).toMatchObject({ completion: 0.5 })
    expect((await p.service.getDayPlan(TODAY)).summary.current).toMatchObject({ done: 0, partial: 1 })
  })

  it('refuses when the task changed in another tab, and overwrites nothing', async () => {
    setClock(world, '2026-03-10T15:00:00Z')
    const p = await person()
    const otherTab = createPlannerService({ getClient: () => p.client, clock: () => Date.parse(world.clockIso) })
    const walk = await task(p, 'Walk')
    await p.service.setCompletion(walk.id, 1)
    await otherTab.setCompletion(walk.id, 0.5) // someone moved it on
    const e = await rejection(p.service.undoCompletion(walk.id, { from: 1, to: 0 }))
    expect(e.code).toBe(SERVICE_ERROR.CONFLICT)
    expect(await rowOf(p, walk.id)).toMatchObject({ completion: 0.5 })
  })

  it('the server itself refuses a stale undo that slips in between the read and the write', async () => {
    setClock(world, '2026-03-10T15:00:00Z')
    const userId = await createUser(world, `undo-race-${(seq += 1)}@example.com`, 'America/New_York')
    let rival = null // set once the task exists
    let raced = false
    const client = createTestClient(world, {
      getUserId: () => userId,
      hooks: {
        before: async (query) => {
          if (rival && !raced && query.table === 'task_occurrences' && query.op === 'update') {
            raced = true
            await world.users.get(userId).api.patch('/task-occurrences/', { completion: 0.5 }, { query: { id: rival } }) // another tab wins the race
          }
        },
      },
    })
    const service = createPlannerService({ getClient: () => client, clock: () => Date.parse(world.clockIso) })
    await service.createTask(TODAY, { title: 'Walk' })
    const walk = (await service.openDay(TODAY)).occurrences[0]
    await service.setCompletion(walk.id, 1)
    rival = walk.id
    const e = await rejection(service.undoCompletion(walk.id, { from: 1, to: 0 }))
    expect(e.code).toBe(SERVICE_ERROR.CONFLICT)
    expect((await listRows(world, userId, 'task-occurrences'))[0].completion).toBe(0.5) // the rival's value stands
  })

  it('undoes only the task it was asked about when several were completed in succession', async () => {
    setClock(world, '2026-03-10T15:00:00Z')
    const p = await person()
    const [a, b, c] = [await task(p, 'A'), await task(p, 'B'), await task(p, 'C')]
    for (const t of [a, b, c]) await p.service.setCompletion(t.id, 1)
    await p.service.undoCompletion(c.id, { from: 1, to: 0 }) // the latest
    const rows = await listRows(world, p.userId, 'task-occurrences')
    expect(Object.fromEntries(rows.map((r) => [r.title, r.completion]))).toEqual({ A: 1, B: 1, C: 0 })
    // an older notice still only ever touches its own task
    await p.service.undoCompletion(a.id, { from: 1, to: 0 })
    expect(Object.fromEntries((await listRows(world, p.userId, 'task-occurrences')).map((r) => [r.title, r.completion]))).toEqual({ A: 0, B: 1, C: 0 })
  })

  it('a repeating task: only that day’s occurrence is touched; the repeating task and other days are as they were', async () => {
    setClock(world, '2026-03-10T15:00:00Z')
    const p = await person()
    const template = await p.service.createTemplate({ title: 'Walk', recurrence: 'daily', startsOn: '2026-03-01' })
    const [walk] = (await p.service.openDay(TODAY)).occurrences
    await p.service.openDay('2026-03-09')
    const yesterdayBefore = (await p.service.getDayPlan('2026-03-09')).occurrences.map((o) => o.completion)
    await p.service.setCompletion(walk.id, 1)
    await p.service.undoCompletion(walk.id, { from: 1, to: 0 })
    expect(await rowOf(p, walk.id)).toMatchObject({ completion: 0, template_id: template.id, plan_state: 'active' })
    expect((await p.service.getDayPlan('2026-03-09')).occurrences.map((o) => o.completion)).toEqual(yesterdayBefore)
    expect((await p.service.listTemplates()).map((t) => ({ id: t.id, recurrence: t.recurrence, startsOn: t.startsOn, endsOn: t.endsOn }))).toEqual([
      { id: template.id, recurrence: 'daily', startsOn: '2026-03-01', endsOn: null },
    ])
    expect(await activeOn(p, '2026-03-11')).toEqual([]) // nothing was created for another day
  })

  it('works until the 7th date back and no longer, counted in the person’s own timezone: the same instant is a different date in New York and Auckland', async () => {
    // A task finished on Wednesday 11 March stays undoable while that date is within 6 days of "today". Auckland (UTC+13) turns to the
    // 18th at 11:00:00 UTC on the 17th, which is only 07:00 on the 17th in New York.
    const attempt = async (timeZone, instant) => {
      setClock(world, '2026-03-11T15:00:00Z')
      const p = await person(timeZone)
      await p.service.createTask('2026-03-11', { title: 'Walk' })
      const walk = (await p.service.openDay('2026-03-11')).occurrences[0]
      await p.service.setCompletion(walk.id, 1)
      setClock(world, instant)
      return { p, walk, undo: () => p.service.undoCompletion(walk.id, { from: 1, to: 0 }) }
    }
    const lastSecond = await attempt('Pacific/Auckland', '2026-03-17T10:59:59Z')
    expect((await lastSecond.p.service.getToday()).today).toBe('2026-03-17')
    expect((await lastSecond.undo()).occurrence.completion).toBe(0)

    const nextSecond = await attempt('Pacific/Auckland', '2026-03-17T11:00:00Z')
    expect((await nextSecond.p.service.getToday()).today).toBe('2026-03-18') // 7 dates back: out of the window
    expect((await rejection(nextSecond.undo())).code).toBe(SERVICE_ERROR.VALIDATION)
    expect(await rowOf(nextSecond.p, nextSecond.walk.id)).toMatchObject({ completion: 1 }) // still done: the record is kept

    const sameInstantNewYork = await attempt('America/New_York', '2026-03-17T11:00:00Z')
    expect((await sameInstantNewYork.p.service.getToday()).today).toBe('2026-03-17')
    expect((await sameInstantNewYork.undo()).occurrence.completion).toBe(0) // still inside New York's window
  })
})

describe('moving a one-off task, and Undo', () => {
  it('moves it, offers a clean Undo, and Undo puts it back on its own day with nothing duplicated', async () => {
    setClock(world, '2026-03-10T15:00:00Z')
    const p = await person()
    const dentist = await task(p, 'Dentist')
    const before = (await p.service.listTemplates()).map((t) => t.id)
    const moved = await p.service.rescheduleOccurrence(dentist.id, '2026-03-12')
    expect(moved.undoIsClean).toBe(true)
    expect(moved.target).toMatchObject({ planDate: '2026-03-12', title: 'Dentist', completion: 0 })
    expect(await activeOn(p, TODAY)).toEqual([]) // it left today
    expect(await activeOn(p, '2026-03-12')).toEqual(['Dentist'])
    await p.service.undoReschedule(dentist.id)
    expect(await activeOn(p, TODAY)).toEqual(['Dentist'])
    expect(await activeOn(p, '2026-03-12')).toEqual([])
    const rows = await listRows(world, p.userId, 'task-occurrences')
    expect(rows.filter((r) => r.title === 'Dentist' && r.plan_state === 'active')).toHaveLength(1) // exactly one live copy
    expect(rows).toHaveLength(1) // and the temporary copy is gone, not hidden
    expect((await p.service.listTemplates()).map((t) => t.id)).toEqual(before)
  })

  it('keeps what was already done: a partly done task moves and its Undo restores it as it was', async () => {
    setClock(world, '2026-03-10T15:00:00Z')
    const p = await person()
    const walk = await task(p, 'Walk')
    await p.service.setCompletion(walk.id, 0.5)
    await p.service.rescheduleOccurrence(walk.id, '2026-03-11')
    await p.service.undoReschedule(walk.id)
    expect(await rowOf(p, walk.id)).toMatchObject({ completion: 0.5, plan_state: 'active', plan_date: TODAY })
  })

  it('a finished task is not moved until it has been undone (so Undo of the completion comes first)', async () => {
    setClock(world, '2026-03-10T15:00:00Z')
    const p = await person()
    const walk = await task(p, 'Walk')
    await p.service.setCompletion(walk.id, 1)
    expect((await rejection(p.service.rescheduleOccurrence(walk.id, '2026-03-12'))).message).toMatch(/Undo it first/)
    await p.service.undoCompletion(walk.id, { from: 1, to: 0 })
    expect((await p.service.rescheduleOccurrence(walk.id, '2026-03-12')).target.planDate).toBe('2026-03-12')
  })
})

describe('moving one occurrence of a repeating task, and Undo', () => {
  it('moves only that occurrence; a weekly task moved to a day it is not due is a clean Undo, and the schedule is untouched', async () => {
    setClock(world, '2026-03-10T15:00:00Z') // a Tuesday
    const p = await person()
    const template = await p.service.createTemplate({ title: 'Gym', recurrence: 'weekly', weekdays: [2], startsOn: '2026-03-01' })
    const [gym] = (await p.service.openDay(TODAY)).occurrences
    const moved = await p.service.rescheduleOccurrence(gym.id, '2026-03-13') // Friday
    expect(moved.undoIsClean).toBe(true)
    expect(await activeOn(p, '2026-03-13')).toEqual(['Gym'])
    await p.service.undoReschedule(gym.id)
    expect(await activeOn(p, TODAY)).toEqual(['Gym'])
    expect(await activeOn(p, '2026-03-13')).toEqual([])
    expect((await p.service.openDay('2026-03-13')).occurrences.filter((o) => o.planState === 'active')).toEqual([]) // Friday is still not a gym day
    const [after] = await p.service.listTemplates()
    expect(after).toMatchObject({ id: template.id, recurrence: 'weekly', weekdays: [2], startsOn: '2026-03-01', endsOn: null })
    expect((await p.service.openDay('2026-03-17')).occurrences.map((o) => o.title)).toEqual(['Gym']) // next Tuesday still gets its own
  })

  it('moving does not change the repeating task: the next day it is due still gets its own occurrence', async () => {
    setClock(world, '2026-03-10T15:00:00Z')
    const p = await person()
    await p.service.createTemplate({ title: 'Gym', recurrence: 'weekly', weekdays: [2], startsOn: '2026-03-01' })
    const [gym] = (await p.service.openDay(TODAY)).occurrences
    await p.service.rescheduleOccurrence(gym.id, '2026-03-13')
    expect((await p.service.openDay('2026-03-17')).occurrences.map((o) => o.title)).toEqual(['Gym'])
    expect((await p.service.getDayPlan('2026-03-13')).occurrences.filter((o) => o.planState === 'active')).toHaveLength(1)
  })

  it('a repeating task that is due on the new day anyway is not offered a quick Undo, and moving it onto a day already holding it is refused', async () => {
    setClock(world, '2026-03-10T15:00:00Z')
    const p = await person()
    await p.service.createTemplate({ title: 'Walk', recurrence: 'daily', startsOn: '2026-03-01' })
    const [walk] = (await p.service.openDay(TODAY)).occurrences
    await p.service.openDay('2026-03-11')
    expect((await rejection(p.service.rescheduleOccurrence(walk.id, '2026-03-11'))).message).toMatch(/already planned for that day/)
    expect((await p.service.rescheduleOccurrence(walk.id, '2026-03-12')).undoIsClean).toBe(false) // Thursday had not been opened
  })

  // FOUND WHILE TESTING (existing behaviour, not changed here; see docs/KNOWN_ISSUES.md): undoing the move above (the "Undo move"
  // button on the moved task) removes the copy and records the daily task as removed for Thursday, so Thursday never gets its own
  // daily occurrence. A quick Undo is therefore not offered in that case. The fix belongs to the planner's removal rules and needs
  // a product decision.
  it.todo('undoing a move of a daily task onto a day that is not open yet leaves that day with its own occurrence of the task')
})

describe('moves at the edges of the editing range', () => {
  it('the range the date field offers is exactly what the planner accepts: 6 days back to 30 days ahead, one day more is refused', async () => {
    setClock(world, '2026-03-10T15:00:00Z')
    const p = await person()
    const { earliest, latest } = editableRange(TODAY)
    expect([earliest, latest]).toEqual(['2026-03-04', '2026-04-09'])
    const accept = async (title, date) => {
      const t = await task(p, title)
      const moved = await p.service.rescheduleOccurrence(t.id, date)
      expect(moved.target.planDate).toBe(date)
    }
    await accept('Back', earliest)
    await accept('Ahead', latest)
    const refuse = async (title, date) => {
      const t = await task(p, title)
      const e = await rejection(p.service.rescheduleOccurrence(t.id, date))
      expect(e.code, date).toBe(SERVICE_ERROR.VALIDATION)
      expect((await rowOf(p, t.id)).plan_state, date).toBe('active') // nothing moved
    }
    await refuse('TooFarBack', '2026-03-03')
    await refuse('TooFarAhead', '2026-04-10')
    expect(await rejection(p.service.rescheduleOccurrence((await task(p, 'Same')).id, TODAY))).toMatchObject({ code: SERVICE_ERROR.VALIDATION }) // the same day is not a move
  })

  it('the limits follow the person’s own date: at one instant Auckland is a day ahead of New York', async () => {
    setClock(world, '2026-03-10T15:00:00Z') // 10 March in New York, 11 March in Auckland
    const ny = await person('America/New_York')
    const nz = await person('Pacific/Auckland')
    expect(editableRange((await ny.service.getToday()).today).latest).toBe('2026-04-09')
    expect(editableRange((await nz.service.getToday()).today).latest).toBe('2026-04-10')
    const nyTask = await task(ny, 'Edge', (await ny.service.getToday()).today)
    const nzTask = await task(nz, 'Edge', (await nz.service.getToday()).today)
    expect((await rejection(ny.service.rescheduleOccurrence(nyTask.id, '2026-04-10'))).code).toBe(SERVICE_ERROR.VALIDATION)
    expect((await nz.service.rescheduleOccurrence(nzTask.id, '2026-04-10')).target.planDate).toBe('2026-04-10')
  })

  it('across a clock change the dates are still whole calendar days (New York, 8 March 2026)', async () => {
    setClock(world, '2026-03-07T17:00:00Z') // Saturday 12:00 EST; Sunday the 8th has only 23 hours
    const p = await person('America/New_York')
    const walk = await task(p, 'Walk', '2026-03-07')
    const moved = await p.service.rescheduleOccurrence(walk.id, '2026-03-09')
    expect(moved.target.planDate).toBe('2026-03-09')
    await p.service.undoReschedule(walk.id)
    expect(await rowOf(p, walk.id)).toMatchObject({ plan_date: '2026-03-07', plan_state: 'active' })
  })
})
