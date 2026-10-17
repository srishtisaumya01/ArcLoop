import { createElement as h } from 'react'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import theme from '../../src/theme/theme.js'
import { createPlannerService } from '../../src/services/planner/createPlannerService.js'
import { createPgliteClient } from '../support/pgliteSupabase.js'
import { createDb, createUser, useFixedClock } from './harness.js'
import { CLOCK, TODAY, count, one } from './plannerSeed.js'

// Recurring Tasks screen -> hook -> REAL planner service -> migration, constraints, triggers and RLS,
// in PGlite. Not PostgREST or a real Supabase project, and not a browser.
const holder = vi.hoisted(() => ({ planner: null, failNext: null }))
vi.mock('../../src/services/planner/index.js', () => ({
  plannerService: new Proxy({}, { get: (_, name) => (...args) => holder.planner[name](...args) }),
}))

const { default: RecurringTasksPage } = await import('../../src/pages/app/RecurringTasksPage.jsx')

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
  userId = await createUser(db, `rec-${(seq += 1)}@example.com`, 'America/New_York')
  const client = createPgliteClient(db, {
    getUserId: () => userId,
    hooks: {
      before: async (state) => {
        if (holder.failNext && holder.failNext(state)) {
          holder.failNext = null
          throw new Error('connection reset')
        }
      },
    },
  })
  service = createPlannerService({ getClient: () => client, clock: () => Date.parse(CLOCK) })
  holder.planner = service
  holder.failNext = null
})

const daily = (title, extra = {}) => ({ title, recurrence: 'daily', startsOn: '2026-03-01', ...extra })
const renderPage = () => render(h(ThemeProvider, { theme }, h(MemoryRouter, { initialEntries: ['/app/recurring'] }, h(RecurringTasksPage))))
const card = (title) => screen.getByRole('heading', { name: title }).closest('li')
const occurrencesOf = async (date) => (await service.getDayPlan(date)).occurrences
const titles = (occs) => occs.map((o) => o.title).sort()

describe('recurring tasks: listing', () => {
  it('shows an empty state, then lists only repeating tasks grouped by status', async () => {
    renderPage()
    expect(await screen.findByText('No recurring tasks yet')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open My Day' }).getAttribute('href')).toBe('/app/day')
  })

  it('separates active, not started and ended tasks, and leaves out one-off tasks and other people\'s', async () => {
    await service.createTemplate(daily('Walk', { plannedStart: '07:00', estimatedMinutes: 30 }))
    await service.createTemplate({ title: 'Gym', recurrence: 'weekly', weekdays: [2, 4], startsOn: '2026-03-01' })
    await service.createTemplate(daily('Language class', { startsOn: '2026-03-20' }))
    await service.createTemplate(daily('Old habit', { startsOn: '2026-02-01', endsOn: '2026-03-01' }))
    const retired = await service.createTemplate(daily('Retired'))
    await service.archiveTemplate(retired.id)
    await service.createTask(TODAY, { title: 'Call the dentist' }) // a one-off, not recurring
    const other = await createUser(db, `rec-other-${(seq += 1)}@example.com`, 'America/New_York')
    const otherService = createPlannerService({ getClient: () => createPgliteClient(db, { getUserId: () => other }), clock: () => Date.parse(CLOCK) })
    await otherService.createTemplate(daily('Secret habit'))

    renderPage()
    const active = await screen.findByRole('region', { name: 'Active' })
    expect(within(active).getAllByRole('heading', { level: 3 }).map((x) => x.textContent)).toEqual(['Gym', 'Walk'])
    expect(within(card('Walk')).getByText('Active')).toBeTruthy()
    expect(within(card('Walk')).getByText('Every day · 07:00 · 30 min')).toBeTruthy()
    expect(within(card('Gym')).getByText('Tue, Thu')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Not started yet' })).getByText('Language class')).toBeTruthy()
    expect(within(card('Language class')).getByText('Starts 20 Mar')).toBeTruthy()
    const ended = screen.getByRole('region', { name: 'Ended' })
    expect(within(ended).getAllByRole('heading', { level: 3 }).map((x) => x.textContent)).toEqual(['Old habit', 'Retired'])
    expect(within(card('Old habit')).queryByRole('button')).toBeNull() // ended tasks are read-only
    expect(screen.queryByText('Call the dentist')).toBeNull()
    expect(screen.queryByText('Secret habit')).toBeNull()
  })

  it('shows a calm error with retry, and recovers', async () => {
    const user = userEvent.setup()
    holder.failNext = (state) => state.table === 'task_templates'
    renderPage()
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText(/connection reset/)).toBeNull()
    await user.click(screen.getByRole('button', { name: /Try again/ }))
    expect(await screen.findByText('No recurring tasks yet')).toBeTruthy()
  })
})

describe('recurring tasks: editing', () => {
  it('updates upcoming untouched days, and leaves past days, worked-on days and edited days alone', async () => {
    const walk = await service.createTemplate(daily('Walk', { estimatedMinutes: 20 }))
    // Plans that already exist: 8 March done (history), today partly done, the 11th untouched,
    // the 12th edited by hand, the 13th untouched.
    for (const date of ['2026-03-08', TODAY, '2026-03-11', '2026-03-12', '2026-03-13']) await service.openDay(date)
    await service.setCompletion((await occurrencesOf('2026-03-08'))[0].id, 1)
    await service.setCompletion((await occurrencesOf(TODAY))[0].id, 0.5)
    await service.updateOccurrence((await occurrencesOf('2026-03-12'))[0].id, { title: 'Walk (my version)' })

    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Walk')
    await user.click(within(card('Walk')).getByRole('button', { name: 'Edit Walk' }))
    const form = screen.getByRole('form', { name: 'Edit Walk' })
    const title = within(form).getByRole('textbox', { name: /^Task/ })
    await user.clear(title)
    await user.type(title, 'Long walk')
    await user.clear(within(form).getByLabelText(/Estimate in minutes/))
    await user.type(within(form).getByLabelText(/Estimate in minutes/), '45')
    await user.click(within(form).getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText(/Saved. 2 upcoming days were updated. 2 planned days were left as they are/)).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Long walk' })).toBeTruthy()

    expect((await service.listTemplates())[0]).toMatchObject({ id: walk.id, title: 'Long walk', estimatedMinutes: 45 })
    // History and anything you worked on or changed is exactly as it was.
    expect((await occurrencesOf('2026-03-08'))[0]).toMatchObject({ title: 'Walk', estimatedMinutes: 20, completion: 1 })
    expect((await occurrencesOf(TODAY))[0]).toMatchObject({ title: 'Walk', completion: 0.5 })
    expect((await occurrencesOf('2026-03-12'))[0]).toMatchObject({ title: 'Walk (my version)' })
    // Untouched upcoming days follow the template.
    expect((await occurrencesOf('2026-03-11'))[0]).toMatchObject({ title: 'Long walk', estimatedMinutes: 45 })
    expect((await occurrencesOf('2026-03-13'))[0]).toMatchObject({ title: 'Long walk' })
    // A day opened later also gets the new version, once.
    expect((await service.openDay('2026-03-14')).occurrences.map((o) => o.title)).toEqual(['Long walk'])
    expect(await count(db, 'task_occurrences', 'template_id = $1', [walk.id])).toBe(6)
  })

  it('changes the schedule without deleting planned days, and says so', async () => {
    const walk = await service.createTemplate(daily('Walk'))
    await service.openDay('2026-03-11') // a Wednesday, already planned
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Walk')
    await user.click(within(card('Walk')).getByRole('button', { name: 'Edit Walk' }))
    const form = screen.getByRole('form', { name: 'Edit Walk' })
    await user.click(within(form).getByLabelText('Repeats'))
    await user.click(await screen.findByRole('option', { name: 'Selected days of the week' }))
    await user.click(within(form).getByRole('checkbox', { name: 'Tue' }))
    await user.click(within(form).getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText(/1 planned day no longer matches the new schedule and was left in place/)).toBeTruthy()
    expect(within(card('Walk')).getByText('Tue')).toBeTruthy()
    expect(await service.listTemplates()).toEqual([expect.objectContaining({ id: walk.id, recurrence: 'weekly', weekdays: [2] })])
    expect(titles(await occurrencesOf('2026-03-11'))).toEqual(['Walk']) // nothing was deleted
    expect(titles((await service.openDay('2026-03-12')).occurrences)).toEqual([]) // Thursday no longer gets it
  })

  it('shows validation without saving, a calm message when saving fails, and can cancel', async () => {
    await service.createTemplate(daily('Walk'))
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Walk')
    await user.click(within(card('Walk')).getByRole('button', { name: 'Edit Walk' }))
    const form = screen.getByRole('form', { name: 'Edit Walk' })
    const title = within(form).getByRole('textbox', { name: /^Task/ })
    await user.clear(title)
    await user.click(within(form).getByRole('button', { name: 'Save changes' }))
    expect(await within(form).findByText('Give the task a title.')).toBeTruthy()
    await user.type(title, 'Walk more')
    await user.click(within(form).getByLabelText('Repeats'))
    await user.click(await screen.findByRole('option', { name: 'Selected days of the week' }))
    await user.click(within(form).getByRole('button', { name: 'Save changes' }))
    expect(await within(form).findByText('Choose at least one day of the week.')).toBeTruthy()
    expect((await service.listTemplates())[0]).toMatchObject({ title: 'Walk', recurrence: 'daily' })

    await user.click(within(form).getByLabelText('Repeats'))
    await user.click(await screen.findByRole('option', { name: 'Every day' }))
    holder.failNext = (state) => state.op === 'update' && state.table === 'task_templates'
    await user.click(within(form).getByRole('button', { name: 'Save changes' }))
    expect(await within(form).findByRole('alert')).toBeTruthy()
    expect(screen.queryByText(/connection reset/)).toBeNull()
    expect((await service.listTemplates())[0].title).toBe('Walk')
    await user.click(within(form).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('form', { name: 'Edit Walk' })).toBeNull()
  })
})

describe('recurring tasks: ending and deleting', () => {
  it('ends a task after confirmation: it stops for new days and every record stays', async () => {
    const walk = await service.createTemplate(daily('Walk'))
    await service.openDay('2026-03-09')
    await service.setCompletion((await occurrencesOf('2026-03-09'))[0].id, 1)
    await service.openDay(TODAY)
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Walk')
    expect(within(card('Walk')).queryByRole('button', { name: 'Delete Walk' })).toBeNull() // running tasks are ended, not deleted
    await user.click(within(card('Walk')).getByRole('button', { name: 'End Walk' }))
    await user.click(await screen.findByRole('button', { name: 'Keep it' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect((await service.listTemplates())[0].archivedAt).toBeNull()

    await user.click(within(card('Walk')).getByRole('button', { name: 'End Walk' }))
    await user.click(await screen.findByRole('button', { name: 'End this task' }))
    const ended = await screen.findByRole('region', { name: 'Ended' })
    expect(within(ended).getByText('Walk')).toBeTruthy()
    expect(within(card('Walk')).getByText('Ended 10 Mar')).toBeTruthy()
    expect(within(card('Walk')).queryByRole('button')).toBeNull()
    const [row] = await service.listTemplates({ includeArchived: true })
    expect(row).toMatchObject({ id: walk.id, endsOn: TODAY })
    expect(row.archivedAt).not.toBeNull()
    // History and today's record are kept; later days no longer get the task.
    expect((await occurrencesOf('2026-03-09'))[0]).toMatchObject({ title: 'Walk', completion: 1 })
    expect(titles(await occurrencesOf(TODAY))).toEqual(['Walk'])
    expect(titles((await service.openDay('2026-03-11')).occurrences)).toEqual([])
    expect(await count(db, 'task_occurrences', 'template_id = $1', [walk.id])).toBe(2)
  })

  it('deletes a task that has not started, after confirmation, and offers nothing else for it', async () => {
    await service.createTemplate(daily('Language class', { startsOn: '2026-03-20' }))
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Language class')
    expect(within(card('Language class')).queryByRole('button', { name: 'End Language class' })).toBeNull()
    await user.click(within(card('Language class')).getByRole('button', { name: 'Delete Language class' }))
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('No recurring tasks yet')).toBeTruthy()
    expect(await one(db, 'select count(*)::int as n from public.task_templates where user_id = $1', [userId])).toEqual({ n: 0 })
  })

  it('shows a message and keeps the task when ending fails', async () => {
    await service.createTemplate(daily('Walk'))
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Walk')
    holder.failNext = (state) => state.op === 'update' && state.table === 'task_templates'
    await user.click(within(card('Walk')).getByRole('button', { name: 'End Walk' }))
    await user.click(await screen.findByRole('button', { name: 'End this task' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await within(card('Walk')).findByRole('alert')).toBeTruthy()
    expect(screen.queryByText(/connection reset/)).toBeNull()
    expect((await service.listTemplates())[0].archivedAt).toBeNull()
    expect(within(screen.getByRole('region', { name: 'Active' })).getByText('Walk')).toBeTruthy()
  })
})
