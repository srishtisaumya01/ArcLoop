import { createElement as h } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import theme from '../../src/theme/theme.js'
import { createPlannerService } from '../../src/services/planner/createPlannerService.js'
import { createPgliteClient } from '../support/pgliteSupabase.js'
import { WEEK_NOTE, WELCOME_BACK } from '../../src/constants/recoveryCopy.js'
import { createDb, createUser, useFixedClock } from './harness.js'
import { CLOCK, TODAY } from './plannerSeed.js'

// My Day and the weekly view -> hooks -> REAL planner service -> migration, constraints and RLS, in
// PGlite. Not PostgREST or a real Supabase project, and not a browser.
const holder = vi.hoisted(() => ({ planner: null }))
vi.mock('../../src/services/planner/index.js', () => ({
  plannerService: new Proxy({}, { get: (_, name) => (...args) => holder.planner[name](...args) }),
}))

const { default: MyDayPage } = await import('../../src/pages/app/MyDayPage.jsx')
const { default: WeeklyOverviewPage } = await import('../../src/pages/app/WeeklyOverviewPage.jsx')

let db
let seq = 0
beforeAll(async () => {
  db = await createDb()
  await useFixedClock(db, CLOCK) // Tuesday 2026-03-10 11:00 in New York
}, 60000)
afterAll(async () => {
  await db?.close()
})

let userId
let service
beforeEach(async () => {
  userId = await createUser(db, `wb-${(seq += 1)}@example.com`, 'America/New_York')
  service = createPlannerService({ getClient: () => createPgliteClient(db, { getUserId: () => userId }), clock: () => Date.parse(CLOCK) })
  holder.planner = service
  localStorage.clear()
})
afterEach(() => localStorage.clear())

const YESTERDAY = '2026-03-09'
const daily = (title) => ({ title, recurrence: 'daily', startsOn: '2026-03-01' })
const wrap = (path, element) => h(ThemeProvider, { theme }, h(MemoryRouter, { initialEntries: [path] }, element))
const renderDay = (path = '/app/day') => render(wrap(path, h(MyDayPage)))
const renderWeek = (path = '/app/week') => render(wrap(path, h(WeeklyOverviewPage)))
const note = (name) => screen.queryByRole('region', { name })
const rowsOn = async (date) => (await db.query('select title, completion, plan_state, excluded_reason from public.task_occurrences where user_id = $1 and plan_date = $2 order by title', [userId, date])).rows
const doneOn = async (date, title, value = 1) => {
  const occurrence = (await service.getDayPlan(date)).occurrences.find((o) => o.title === title)
  return service.setCompletion(occurrence.id, value)
}

describe('My Day: welcome back', () => {
  it('shows the approved note after a planned day with no progress, and changes nothing in the history', async () => {
    await service.createTemplate(daily('Walk'))
    await service.createTemplate(daily('Read'))
    await service.openDay(YESTERDAY) // planned, left untouched
    const before = await rowsOn(YESTERDAY)
    const dayBefore = (await db.query('select plan_date, day_mode, baseline_at from public.day_plans where user_id = $1 and plan_date = $2', [userId, YESTERDAY])).rows
    renderDay()
    const welcome = await screen.findByRole('region', { name: 'Welcome back' })
    expect(welcome).toHaveTextContent(WELCOME_BACK.heading)
    expect(welcome).toHaveTextContent(WELCOME_BACK.message)
    expect(welcome).toHaveTextContent(WELCOME_BACK.supporting)
    expect(await screen.findByText('Walk')).toBeTruthy() // today's plan is still the normal one
    // Nothing from yesterday was recreated, moved, completed or altered, and no catch-up was suggested.
    expect(await rowsOn(YESTERDAY)).toEqual(before)
    expect((await db.query('select plan_date, day_mode, baseline_at from public.day_plans where user_id = $1 and plan_date = $2', [userId, YESTERDAY])).rows).toEqual(dayBefore)
    expect((await rowsOn(TODAY)).map((r) => r.title)).toEqual(['Read', 'Walk']) // only today's own tasks
    expect(welcome.textContent).not.toMatch(/catch up|make up for the|behind|missed|overdue|streak/i)
  })

  it('does not show when yesterday had progress, was a rest day, or when nothing was ever planned', async () => {
    await service.createTemplate(daily('Walk'))
    await service.openDay(YESTERDAY)
    await doneOn(YESTERDAY, 'Walk', 0.5)
    const first = renderDay()
    await screen.findByText('Walk')
    await new Promise((r) => setTimeout(r, 300))
    expect(note('Welcome back')).toBeNull()
    first.unmount()

    await db.query('update public.task_occurrences set completion = 0 where user_id = $1 and plan_date = $2', [userId, YESTERDAY])
    await service.setDayMode(YESTERDAY, 'rest')
    const second = renderDay()
    await screen.findByText('Walk')
    await new Promise((r) => setTimeout(r, 300))
    expect(note('Welcome back')).toBeNull()
    second.unmount()
  })

  it('does not infer a missed day from dates with no plan', async () => {
    renderDay() // a brand-new person, no plans at all
    expect(await screen.findByText('No tasks on this day')).toBeTruthy()
    await new Promise((r) => setTimeout(r, 300))
    expect(note('Welcome back')).toBeNull()
  })

  it('looks past unplanned days to the last planned one', async () => {
    await service.createTemplate(daily('Walk'))
    await service.openDay('2026-03-06') // planned, untouched; 7 to 9 March were never opened
    renderDay()
    expect(await screen.findByRole('region', { name: 'Welcome back' })).toBeTruthy()
  })

  it('goes away as soon as something is done today, and stays gone', async () => {
    await service.createTemplate(daily('Walk'))
    await service.openDay(YESTERDAY)
    const user = userEvent.setup()
    renderDay()
    await screen.findByRole('region', { name: 'Welcome back' })
    await user.click(await screen.findByRole('button', { name: 'Done: Walk' }))
    await waitFor(() => expect(note('Welcome back')).toBeNull())
    expect(Number((await rowsOn(YESTERDAY))[0].completion)).toBe(0) // yesterday is untouched by today's progress
  })

  it('can be dismissed, and stays dismissed for the day', async () => {
    await service.createTemplate(daily('Walk'))
    await service.openDay(YESTERDAY)
    const user = userEvent.setup()
    const first = renderDay()
    await screen.findByRole('region', { name: 'Welcome back' })
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(note('Welcome back')).toBeNull()
    first.unmount()
    renderDay()
    await screen.findByText('Walk')
    await new Promise((r) => setTimeout(r, 300))
    expect(note('Welcome back')).toBeNull()
  })

  it('only appears on today, not when looking at another day', async () => {
    await service.createTemplate(daily('Walk'))
    await service.openDay(YESTERDAY)
    renderDay(`/app/day?date=${YESTERDAY}`)
    await screen.findByText('Walk')
    await new Promise((r) => setTimeout(r, 300))
    expect(note('Welcome back')).toBeNull()
  })
})

describe('weekly view: after missed days', () => {
  it('shows the approved note for a week with a past planned day that had no progress', async () => {
    await service.createTemplate(daily('Walk'))
    await service.openDay(YESTERDAY)
    renderWeek()
    const weekly = await screen.findByRole('region', { name: 'After missed days' })
    expect(weekly).toHaveTextContent(WEEK_NOTE.heading)
    expect(weekly).toHaveTextContent(WEEK_NOTE.message)
    expect(weekly.textContent).not.toMatch(/catch up|behind|missed|overdue|streak/i)
  })

  it('is left out when it is not relevant: progress was made, only today is open, or nothing was planned', async () => {
    await service.createTemplate(daily('Walk'))
    await service.openDay(YESTERDAY)
    await doneOn(YESTERDAY, 'Walk')
    await service.openDay(TODAY) // today's task is simply not done yet
    const first = renderWeek()
    await screen.findByText('This week')
    await new Promise((r) => setTimeout(r, 300))
    expect(note('After missed days')).toBeNull()
    first.unmount()
    renderWeek('/app/week?week=2026-03-16') // a week that has not started
    await screen.findByText('Back to this week')
    await new Promise((r) => setTimeout(r, 300))
    expect(note('After missed days')).toBeNull()
  })

  it('appears when reviewing an earlier week, is dismissible, and is remembered per week', async () => {
    await service.createTemplate(daily('Walk'))
    await service.openDay('2026-03-05') // an earlier week's planned day, untouched
    await service.openDay(YESTERDAY) // this week's planned day, untouched
    const user = userEvent.setup()
    const first = renderWeek('/app/week?week=2026-03-02')
    await screen.findByRole('region', { name: 'After missed days' })
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(note('After missed days')).toBeNull()
    first.unmount()
    renderWeek('/app/week?week=2026-03-02')
    await screen.findByText('Back to this week')
    await new Promise((r) => setTimeout(r, 300))
    expect(note('After missed days')).toBeNull() // still dismissed for that week
    // This week was never dismissed.
    const second = renderWeek('/app/week')
    expect(await screen.findAllByRole('region', { name: 'After missed days' })).toHaveLength(1)
    second.unmount()
  })
})
