import { createElement as h } from 'react'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import theme from '../../src/theme/theme.js'
import { createPlannerService } from '../../src/services/planner/createPlannerService.js'
import { SERVICE_ERROR } from '../../src/services/planner/errors.js'
import { createPgliteClient } from '../support/pgliteSupabase.js'
import { createDb, createUser, useFixedClock } from './harness.js'
import { CLOCK, TODAY } from './plannerSeed.js'

// Progress page -> hook -> REAL planner service -> migration, constraints, triggers and RLS, in PGlite.
// Not PostgREST or a real Supabase project, and not a browser.
const holder = vi.hoisted(() => ({ planner: null, failNext: false }))
vi.mock('../../src/services/planner/index.js', () => ({
  plannerService: new Proxy({}, { get: (_, name) => (...args) => holder.planner[name](...args) }),
}))

const { default: ProgressPage } = await import('../../src/pages/app/ProgressPage.jsx')

let db
let seq = 0
beforeAll(async () => {
  db = await createDb()
  await useFixedClock(db, CLOCK) // Tuesday 2026-03-10 11:00 in New York; the editing window starts 2026-03-04
}, 60000)
afterAll(async () => {
  await db?.close()
})

let userId
let service
beforeEach(async () => {
  userId = await createUser(db, `prog-${(seq += 1)}@example.com`, 'America/New_York')
  const client = createPgliteClient(db, {
    getUserId: () => userId,
    hooks: {
      before: async (state) => {
        if (holder.failNext && state.table === 'day_plans') {
          holder.failNext = false
          throw new Error('connection reset')
        }
      },
    },
  })
  service = createPlannerService({ getClient: () => client, clock: () => Date.parse(CLOCK) })
  holder.planner = service
  holder.failNext = false
})

const daily = (title, extra = {}) => ({ title, recurrence: 'daily', startsOn: '2026-03-01', ...extra })
const occOn = async (date, title) => (await service.getDayPlan(date)).occurrences.find((o) => o.title === title)

// One week of history, worked out by hand:
//   Walk  4 done, 5 done, 6 partly, 7 not done, 8 (rest day: left out), 9 set aside (left out), 10 today, not done
//         -> counted 4,5,6,7,10 = 5 planned, 2 done, 1 partly, units 2.5 -> 50%
//   Read  4, 5, 6, 7 done, 8 (rest day: left out), 9 done, 10 today, not done
//         -> counted 4,5,6,7,9,10 = 6 planned, 5 done, units 5 -> 83%
async function seedWeek() {
  await service.createTemplate(daily('Walk'))
  await service.createTemplate(daily('Read'))
  for (const d of ['2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09', TODAY]) await service.openDay(d)
  const done = (date, title, value = 1) => occOn(date, title).then((o) => service.setCompletion(o.id, value))
  await done('2026-03-04', 'Walk')
  await done('2026-03-05', 'Walk')
  await done('2026-03-06', 'Walk', 0.5)
  for (const d of ['2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-09']) await done(d, 'Read')
  await service.setDayMode('2026-03-08', 'rest')
  await service.setAside((await occOn('2026-03-09', 'Walk')).id, 'busy_day')
}

const renderPage = () => render(h(ThemeProvider, { theme }, h(MemoryRouter, { initialEntries: ['/app/progress'] }, h(ProgressPage))))
const habit = (title) => screen.getByRole('heading', { name: title }).closest('li')

describe('getHabitProgress (real service and database)', () => {
  it('follows the planner rules: done and partly done count, rest days and set-aside tasks do not', async () => {
    await seedWeek()
    const progress = await service.getHabitProgress()
    expect(progress).toMatchObject({ from: '2026-02-11', to: TODAY, days: 28 })
    expect(progress.habits.map((x) => [x.title, x.planned, x.done, x.partial, x.percent])).toEqual([
      ['Read', 6, 5, 0, 83],
      ['Walk', 5, 2, 1, 50],
    ])
  })

  it('leaves out one-off tasks and other people\'s tasks, and has nothing before anything is planned', async () => {
    expect((await service.getHabitProgress()).habits).toEqual([])
    await service.createTask(TODAY, { title: 'Call the dentist' })
    const other = await createUser(db, `prog-other-${(seq += 1)}@example.com`, 'America/New_York')
    const otherService = createPlannerService({ getClient: () => createPgliteClient(db, { getUserId: () => other }), clock: () => Date.parse(CLOCK) })
    await otherService.createTemplate(daily('Secret habit'))
    await otherService.openDay(TODAY)
    expect((await service.getHabitProgress()).habits).toEqual([])
  })

  it('rejects a period that is not 7 to 90 whole days', async () => {
    for (const days of [6, 91, 28.5, '28', null]) {
      const error = await service.getHabitProgress({ days }).catch((e) => e)
      expect(error.code).toBe(SERVICE_ERROR.VALIDATION)
    }
    expect((await service.getHabitProgress({ days: 7 })).from).toBe('2026-03-04')
  })

  it('keeps a task after its repeating task ended, and marks it ended', async () => {
    const walk = await service.createTemplate(daily('Walk'))
    await service.openDay(TODAY)
    await service.setCompletion((await occOn(TODAY, 'Walk')).id, 1)
    await service.archiveTemplate(walk.id)
    expect((await service.getHabitProgress()).habits).toEqual([expect.objectContaining({ title: 'Walk', archived: true, planned: 1, done: 1, percent: 100 })])
  })
})

describe('progress page', () => {
  it('shows recent weeks and each repeating task from the stored data', async () => {
    await seedWeek()
    renderPage()
    expect(await screen.findByLabelText('Loading your progress')).toBeTruthy()
    const weeks = await screen.findByRole('region', { name: 'Recent weeks' })
    expect(within(weeks).getAllByRole('heading', { level: 3 })).toHaveLength(8)
    // The week of 2 to 8 March: Walk and Read progress on 4, 5, 6 and 7 March, one rest day.
    const lastWeek = within(weeks).getByRole('heading', { name: /2 Mar to 8 Mar 2026/ }).closest('li')
    expect(within(lastWeek).getByText('4 days with progress · 6 tasks done · 1 partly done · 1 rest day')).toBeTruthy()
    expect(within(lastWeek).getByRole('link', { name: /View week of 2 Mar to 8 Mar 2026/ }).getAttribute('href')).toBe('/app/week?week=2026-03-02')
    expect(within(weeks).getByText('This week')).toBeTruthy()
    // Visual regression (found in a Chromium check): the chip sits beside the heading text, not inside it, so on a
    // phone it can no longer push the View week button onto a line of its own.
    const thisWeekHeading = within(weeks).getByRole('heading', { name: /9 Mar to 15 Mar 2026/ })
    expect(thisWeekHeading.textContent).toBe('9 Mar to 15 Mar 2026')
    expect(thisWeekHeading.closest('li')).toHaveTextContent('This week')
    expect(within(weeks).getAllByText('Nothing planned this week.').length).toBeGreaterThanOrEqual(5)

    const habits = screen.getByRole('region', { name: 'Recurring tasks' })
    expect(within(habits).getAllByRole('heading', { level: 3 }).map((x) => x.textContent)).toEqual(['Read', 'Walk'])
    expect(within(habit('Read')).getByText('5 of 6 planned days done')).toBeTruthy()
    expect(within(habit('Read')).getByText('83%')).toBeTruthy()
    expect(within(habit('Walk')).getByText('2 of 5 planned days done, 1 partly done')).toBeTruthy()
    expect(within(habit('Walk')).getByText('50%')).toBeTruthy()
    expect(screen.getByText(/Rest days, and tasks you moved or set aside, are not counted/)).toBeTruthy()
  })

  it('uses calm wording: no streaks, scores to beat or missed days', async () => {
    await seedWeek()
    renderPage()
    await screen.findByRole('region', { name: 'Recent weeks' })
    expect(document.body.textContent).not.toMatch(/streak|missed|behind|failed|lazy|leaderboard|rank/i)
  })

  it('shows an empty state before anything is planned', async () => {
    renderPage()
    expect(await screen.findByText('Nothing to show yet')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open My Day' }).getAttribute('href')).toBe('/app/day')
    expect(screen.queryByRole('region', { name: 'Recent weeks' })).toBeNull()
  })

  it('shows a calm error with retry, and recovers', async () => {
    await seedWeek()
    const user = userEvent.setup()
    holder.failNext = true
    renderPage()
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText(/connection reset/)).toBeNull()
    await user.click(screen.getByRole('button', { name: /Try again/ }))
    expect(await screen.findByRole('region', { name: 'Recent weeks' })).toBeTruthy()
  })
})
