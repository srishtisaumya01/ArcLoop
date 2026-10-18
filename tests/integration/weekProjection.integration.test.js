import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createPlannerService } from '../../src/services/planner/createPlannerService.js'
import { CLOCK, TODAY } from '../support/plannerSeed.js'
import { countRows, createTestClient, createUser, createWorld } from './harness.js'

// The Week's projection of repeating tasks, through the real service and the real Django API and database: today
// without a record, unopened future days, saved occurrences, template edits, duplicates, and a timezone boundary.
let world
let seq = 0
beforeAll(() => {
  world = createWorld(CLOCK) // 2026-03-10T15:00Z: Tuesday 11:00 in New York, Wednesday 04:00 in Auckland
})

const serviceFor = (userId) => createPlannerService({ getClient: () => createTestClient(world, { getUserId: () => userId }), clock: () => Date.parse(CLOCK) })
let userId
let service
beforeEach(async () => {
  userId = await createUser(world, `proj-${(seq += 1)}@example.com`, 'America/New_York')
  service = serviceFor(userId)
})
const daily = (title, extra = {}) => ({ title, recurrence: 'daily', startsOn: '2026-03-01', ...extra })
const byDate = (week, date) => week.days.find((d) => d.date === date)
const rowCount = () => countRows(world, userId, 'task-occurrences')
const dayCount = () => countRows(world, userId, 'day-plans')

describe('Week projection of repeating tasks', () => {
  it('today without a record shows its repeating tasks as not started yet, creating nothing', async () => {
    await service.createTemplate(daily('Walk', { estimatedMinutes: 20 }))
    await service.createTemplate({ title: 'Gym', recurrence: 'weekly', weekdays: [2, 4], startsOn: '2026-03-01' }) // Tue, Thu
    const week = await service.getWeekSummary()
    expect(byDate(week, TODAY)).toMatchObject({ kind: 'upcoming', plannedCount: 2, expectedCount: 2 })
    expect(byDate(week, TODAY).tasks.map((t) => [t.title, t.expected])).toEqual([['Walk', true], ['Gym', true]])
    expect(week.upcomingTasks).toBe(1 + 2 + 1 + 1 + 1) // after today: Wed(1) Thu(2) Fri Sat Sun
    expect(week.tasksRemaining).toBe(2) // today's two, not started yet
    expect(week.daysWithPlan).toBe(0)
    expect(await dayCount()).toBe(0)
    expect(await rowCount()).toBe(0)
  })

  it('once today is opened its record is authoritative and nothing is counted twice', async () => {
    await service.createTemplate(daily('Walk'))
    await service.openDay(TODAY)
    const week = await service.getWeekSummary()
    expect(byDate(week, TODAY)).toMatchObject({ kind: 'planned', count: 1 })
    expect(byDate(week, TODAY).expectedCount).toBeUndefined()
    expect(week.upcomingTasks).toBe(5) // Wed..Sun only
    expect(await rowCount()).toBe(1)
  })

  it('editing a repeating task: history keeps its row, opened untouched days are updated by the edit, unopened days follow the current template', async () => {
    const walk = await service.createTemplate(daily('Walk', { estimatedMinutes: 20 }))
    await service.openDay('2026-03-09') // yesterday
    await service.setCompletion((await service.getDayPlan('2026-03-09')).occurrences[0].id, 1)
    await service.openDay('2026-03-12') // Thursday, untouched
    await service.updateTemplate(walk.id, { title: 'Long walk', estimatedMinutes: 45 })
    const week = await service.getWeekSummary()
    expect(byDate(week, '2026-03-09').tasks[0]).toMatchObject({ title: 'Walk', estimatedMinutes: 20, completion: 1 }) // history unchanged
    expect(byDate(week, '2026-03-12').tasks[0]).toMatchObject({ title: 'Long walk', estimatedMinutes: 45 }) // real row, refreshed by the edit
    expect(byDate(week, '2026-03-12').tasks[0]).not.toHaveProperty('expected') // it is a saved row, not a projection
    expect(byDate(week, '2026-03-11').tasks[0]).toMatchObject({ title: 'Long walk', estimatedMinutes: 45, expected: true }) // projection
    expect(byDate(week, TODAY).tasks[0]).toMatchObject({ title: 'Long walk', expected: true })
    expect(week.upcomingTasks).toBe(5) // Wed..Sun, Thursday counted once
    expect(week.tasksRemaining).toBe(1) // today's, not started
    expect(await rowCount()).toBe(2)
  })

  it('a task moved onto an unopened day, or set aside there, is counted once and never re-added', async () => {
    await service.createTemplate(daily('Walk'))
    await service.openDay(TODAY)
    const todayWalk = (await service.getDayPlan(TODAY)).occurrences[0]
    await service.rescheduleOccurrence(todayWalk.id, '2026-03-11') // creates Wednesday with the moved copy
    let week = await service.getWeekSummary()
    expect(byDate(week, '2026-03-11')).toMatchObject({ plannedCount: 1, expectedCount: 0 }) // the copy, not a second Walk
    await service.setAside((await service.getDayPlan('2026-03-11')).occurrences[0].id, 'busy_day')
    week = await service.getWeekSummary()
    expect(byDate(week, '2026-03-11')).toMatchObject({ plannedCount: 0, expectedCount: 0, setAsideCount: 1 }) // present, so not re-added
    expect(byDate(week, TODAY)).toMatchObject({ kind: 'empty', setAsideCount: 1 }) // the original stays as "moved"
  })

  it('a planned future rest day is still projected (rest only labels a day) and an ended task is not', async () => {
    const walk = await service.createTemplate(daily('Walk'))
    await service.setDayMode('2026-03-13', 'rest')
    let week = await service.getWeekSummary()
    expect(byDate(week, '2026-03-13')).toMatchObject({ isRestDay: true, plannedCount: 1, expectedCount: 1 })
    await service.archiveTemplate(walk.id) // ends today, inclusive
    week = await service.getWeekSummary()
    expect(byDate(week, TODAY).plannedCount).toBe(1) // an unopened today still expects it, as opening the day would add it
    expect(week.upcomingTasks).toBe(0) // and nothing after today
    expect(week.tasksRemaining).toBe(1)
  })

  it('uses the profile timezone to decide which day is today', async () => {
    const nz = await createUser(world, `proj-nz-${(seq += 1)}@example.com`, 'Pacific/Auckland')
    const nzService = serviceFor(nz)
    await nzService.createTemplate(daily('Walk'))
    const week = await nzService.getWeekSummary()
    expect(week.today).toBe('2026-03-11') // already Wednesday in Auckland
    expect(byDate(week, '2026-03-10')).toMatchObject({ kind: 'no_record' }) // Tuesday is over there: never opened, never projected
    expect(byDate(week, '2026-03-11')).toMatchObject({ kind: 'upcoming', expectedCount: 1 })
    expect(week.upcomingTasks).toBe(4) // Thu..Sun
    expect(week.tasksRemaining).toBe(1) // Wednesday, Auckland's today
    const ny = await service.getWeekSummary()
    expect(ny.today).toBe(TODAY)
    expect(byDate(ny, '2026-03-10')).toMatchObject({ kind: 'upcoming' }) // and still Tuesday in New York
  })
})
