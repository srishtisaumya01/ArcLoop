import { createElement as h } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { setupUser } from './user.js'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import theme from '../../src/theme/theme.js'
import { createPlannerService } from '../../src/services/planner/createPlannerService.js'
import { countRows, createTestClient, createUser, createWorld } from './harness.js'
import { CLOCK, TODAY } from '../support/plannerSeed.js'

// Recurring Tasks screen -> hook -> REAL planner service -> migration, constraints, triggers and RLS,
// Not a browser.
const holder = vi.hoisted(() => ({ planner: null, failNext: null }))
vi.mock('../../src/services/planner/index.js', () => ({
  plannerService: new Proxy({}, { get: (_, name) => (...args) => holder.planner[name](...args) }),
}))

const { default: RecurringTasksPage } = await import('../../src/pages/app/RecurringTasksPage.jsx')

let world
let seq = 0
beforeAll(() => {
  world = createWorld(CLOCK) // Tuesday 2026-03-10 11:00 in New York
})

let userId
let service
beforeEach(async () => {
  userId = await createUser(world, `rec-${(seq += 1)}@example.com`, 'America/New_York')
  const client = createTestClient(world, {
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
    const other = await createUser(world, `rec-other-${(seq += 1)}@example.com`, 'America/New_York')
    const otherService = createPlannerService({ getClient: () => createTestClient(world, { getUserId: () => other }), clock: () => Date.parse(CLOCK) })
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
    const user = setupUser()
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

    const user = setupUser()
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
    expect(await countRows(world, userId, 'task-occurrences', { template_id: walk.id })).toBe(6)
  })

  it('edits description, category and end time; untouched upcoming days follow, history and edited days do not', async () => {
    const walk = await service.createTemplate(daily('Walk', { plannedStart: '07:00' }))
    await service.openDay('2026-03-09')
    await service.setCompletion((await occurrencesOf('2026-03-09'))[0].id, 1) // history
    await service.openDay(TODAY)
    await service.openDay('2026-03-11')
    await service.updateOccurrence((await occurrencesOf('2026-03-11'))[0].id, { category: 'Mine' }) // edited by hand
    const user = setupUser()
    renderPage()
    await screen.findByText('Walk')
    await user.click(within(card('Walk')).getByRole('button', { name: 'Edit Walk' }))
    const form = screen.getByRole('form', { name: 'Edit Walk' })
    fireEvent.change(within(form).getByLabelText(/End time/), { target: { value: '07:30' } })
    await user.type(within(form).getByLabelText(/Category/), 'Health')
    await user.type(within(form).getByLabelText(/Description/), 'Before breakfast.')
    await user.click(within(form).getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText(/Saved\. 1 upcoming day was updated\. 1 planned day was left as they are/)).toBeTruthy()
    expect(within(card('Walk')).getByText('Every day · 07:00 to 07:30 · Health')).toBeTruthy()
    expect(within(card('Walk')).getByText('Before breakfast.')).toBeTruthy()
    expect((await service.listTemplates())[0]).toMatchObject({ id: walk.id, plannedEnd: '07:30', category: 'Health', description: 'Before breakfast.' })
    expect((await occurrencesOf(TODAY))[0]).toMatchObject({ plannedEnd: '07:30', category: 'Health', description: 'Before breakfast.' }) // untouched, today: follows
    expect((await occurrencesOf('2026-03-09'))[0]).toMatchObject({ plannedEnd: null, category: null, completion: 1 }) // history: unchanged
    expect((await occurrencesOf('2026-03-11'))[0]).toMatchObject({ plannedEnd: null, category: 'Mine' }) // hand-edited: unchanged
    // Validation stays the planner's: an end time without a start time is refused, under the end-time field.
    await user.click(within(card('Walk')).getByRole('button', { name: 'Edit Walk' }))
    const again = screen.getByRole('form', { name: 'Edit Walk' })
    fireEvent.change(within(again).getByLabelText(/Start time/), { target: { value: '' } })
    await user.click(within(again).getByRole('button', { name: 'Save changes' }))
    expect(await within(again).findByText('Add a start time first.')).toBeTruthy()
    expect((await service.listTemplates())[0].plannedStart).toBe('07:00')
  })

  it('edits the start and end dates: planned days outside the new dates stay, history stays, and an end date before today ends it', async () => {
    const walk = await service.createTemplate(daily('Walk'))
    await service.openDay('2026-03-09')
    await service.setCompletion((await occurrencesOf('2026-03-09'))[0].id, 1)
    await service.openDay(TODAY)
    const user = setupUser()
    renderPage()
    await screen.findByText('Walk')
    await user.click(within(card('Walk')).getByRole('button', { name: 'Edit Walk' }))
    const form = screen.getByRole('form', { name: 'Edit Walk' })
    // End before start: the planner refuses it under the end-date field and nothing is saved.
    fireEvent.change(within(form).getByLabelText(/Ends on/), { target: { value: '2026-02-01' } })
    await user.click(within(form).getByRole('button', { name: 'Save changes' }))
    expect(await within(form).findByText('The end date cannot be before the start date.')).toBeTruthy()
    expect((await service.listTemplates())[0]).toMatchObject({ startsOn: '2026-03-01', endsOn: null })
    // Start tomorrow, end on the 13th: today's planned day no longer matches and is left in place; the 9th is history.
    fireEvent.change(within(form).getByLabelText(/Starts on/), { target: { value: '2026-03-11' } })
    fireEvent.change(within(form).getByLabelText(/Ends on/), { target: { value: '2026-03-13' } })
    await user.click(within(form).getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText(/1 planned day no longer matches the new schedule and was left in place/)).toBeTruthy()
    expect(within(card('Walk')).getByText('Starts 11 Mar')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Not started yet' })).getByText('Walk')).toBeTruthy()
    expect((await service.listTemplates())[0]).toMatchObject({ id: walk.id, startsOn: '2026-03-11', endsOn: '2026-03-13' })
    expect(await countRows(world, userId, 'task-occurrences', { template_id: walk.id })).toBe(2) // nothing deleted
    expect((await occurrencesOf('2026-03-09'))[0]).toMatchObject({ title: 'Walk', completion: 1 })
    expect((await service.openDay('2026-03-14')).occurrences.map((o) => o.title)).toEqual([]) // after the end date
    expect((await service.openDay('2026-03-12')).occurrences.map((o) => o.title)).toEqual(['Walk']) // inside the dates
    // An end date before today ends the task: it moves to Ended, read-only, and its records stay.
    await user.click(within(card('Walk')).getByRole('button', { name: 'Edit Walk' }))
    const again = screen.getByRole('form', { name: 'Edit Walk' })
    fireEvent.change(within(again).getByLabelText(/Starts on/), { target: { value: '2026-03-01' } })
    fireEvent.change(within(again).getByLabelText(/Ends on/), { target: { value: '2026-03-09' } })
    await user.click(within(again).getByRole('button', { name: 'Save changes' }))
    const ended = await screen.findByRole('region', { name: 'Ended' })
    expect(within(ended).getByText('Walk')).toBeTruthy()
    expect(within(card('Walk')).getByText('Ended 9 Mar')).toBeTruthy()
    expect(within(card('Walk')).queryByRole('button')).toBeNull()
    expect((await occurrencesOf('2026-03-09'))[0]).toMatchObject({ completion: 1 })
    expect(await countRows(world, userId, 'task-occurrences', { template_id: walk.id })).toBe(3)
  })

  it('changes the schedule without deleting planned days, and says so', async () => {
    const walk = await service.createTemplate(daily('Walk'))
    await service.openDay('2026-03-11') // a Wednesday, already planned
    const user = setupUser()
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
    const user = setupUser()
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
    const user = setupUser()
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
    expect(await countRows(world, userId, 'task-occurrences', { template_id: walk.id })).toBe(2)
  })

  it('deletes a task that has not started, after confirmation, and offers nothing else for it', async () => {
    await service.createTemplate(daily('Language class', { startsOn: '2026-03-20' }))
    const user = setupUser()
    renderPage()
    await screen.findByText('Language class')
    expect(within(card('Language class')).queryByRole('button', { name: 'End Language class' })).toBeNull()
    await user.click(within(card('Language class')).getByRole('button', { name: 'Delete Language class' }))
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('No recurring tasks yet')).toBeTruthy()
    expect(await countRows(world, userId, 'task-templates')).toBe(0)
  })

  it('shows a message and keeps the task when ending fails', async () => {
    await service.createTemplate(daily('Walk'))
    const user = setupUser()
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
