import { createElement as h } from 'react'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import theme from '../../src/theme/theme.js'
import { createPlannerService } from '../../src/services/planner/createPlannerService.js'
import { createPgliteClient } from '../support/pgliteSupabase.js'
import { createDb, createUser, useFixedClock } from './harness.js'
import { CLOCK, TODAY, count } from './plannerSeed.js'

// UI -> hook -> REAL planner service -> migration, constraints, triggers and RLS, in PGlite.
// Not a browser, not PostgREST and not a real Supabase project (see plannerService.integration.test.js).
const holder = vi.hoisted(() => ({ service: null }))
vi.mock('../../src/services/planner/index.js', () => ({
  plannerService: new Proxy({}, { get: (_, name) => (...args) => holder.service[name](...args) }),
}))

const { default: MyDayPage } = await import('../../src/pages/app/MyDayPage.jsx')

let db
let seq = 0
beforeAll(async () => {
  db = await createDb()
  await useFixedClock(db, CLOCK)
}, 60000)
afterAll(async () => {
  await db?.close()
})

let userId
let service
beforeEach(async () => {
  userId = await createUser(db, `myday-${(seq += 1)}@example.com`, 'America/New_York')
  const client = createPgliteClient(db, { getUserId: () => userId })
  service = createPlannerService({ getClient: () => client, clock: () => Date.parse(CLOCK) })
  holder.service = service
})

const daily = (title, extra = {}) => ({ title, recurrence: 'daily', startsOn: '2026-03-01', ...extra })
const renderDay = (path = '/app/day') =>
  render(h(ThemeProvider, { theme }, h(MemoryRouter, { initialEntries: [path] }, h(MyDayPage))))
const progress = () => screen.getByLabelText('Day progress', { selector: 'section' })
const persisted = async (title) => (await service.getDayPlan(TODAY)).occurrences.find((o) => o.title === title)

describe('My Day against the real service and database', () => {
  it('shows today\'s tasks from templates, creating the day', async () => {
    await service.createTemplate(daily('Walk', { plannedStart: '07:00' }))
    await service.createTemplate(daily('Read'))
    renderDay()
    expect(await screen.findByText('Walk')).toBeTruthy()
    expect(screen.getByText('Read')).toBeTruthy()
    expect(within(progress()).getByText('0% of today’s plan')).toBeTruthy()
    expect(screen.getByText('Today')).toBeTruthy()
    expect(await count(db, 'task_occurrences', 'user_id = $1', [userId])).toBe(2)
  })

  it('records done and partly done, saves them, and updates progress', async () => {
    await service.createTemplate(daily('Walk'))
    await service.createTemplate(daily('Read'))
    const user = userEvent.setup()
    renderDay()
    await screen.findByText('Walk')
    await user.click(screen.getByRole('button', { name: 'Done: Walk' }))
    await waitFor(() => expect(within(progress()).getByText('50% of today’s plan')).toBeTruthy())
    expect((await persisted('Walk')).completion).toBe(1)
    expect((await persisted('Walk')).completedAt).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Partly: Read' }))
    await waitFor(() => expect(within(progress()).getByText('75% of today’s plan')).toBeTruthy())
    expect((await persisted('Read')).completion).toBe(0.5)
    // Undo goes back to not done and clears the stamp.
    await user.click(screen.getByRole('button', { name: 'Not done: Walk' }))
    await waitFor(() => expect(within(progress()).getByText('25% of today’s plan')).toBeTruthy())
    expect((await persisted('Walk')).completion).toBe(0)
  })

  it('adds a task, with validation shown for an empty title', async () => {
    const user = userEvent.setup()
    renderDay()
    expect(await screen.findByText('No tasks on this day')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Add task' }))
    expect(await screen.findByText('Give the task a title.')).toBeTruthy()
    expect(await count(db, 'task_occurrences', 'user_id = $1', [userId])).toBe(0)
    await user.type(screen.getByRole('textbox', { name: /^Task/ }), 'Call the dentist')
    await user.type(screen.getByLabelText(/Estimate in minutes/), '15')
    await user.click(screen.getByRole('button', { name: 'Add task' }))
    expect(await screen.findByText('Call the dentist')).toBeTruthy()
    expect((await persisted('Call the dentist')).estimatedMinutes).toBe(15)
    expect(screen.queryByText('Give the task a title.')).toBeNull()
  })

  it('sets a task aside and puts it back; set-aside tasks leave the progress maths', async () => {
    await service.createTemplate(daily('Walk'))
    await service.createTemplate(daily('Read'))
    const user = userEvent.setup()
    renderDay()
    await screen.findByText('Walk')
    await user.click(screen.getByRole('button', { name: 'Done: Walk' }))
    await user.click(await screen.findByRole('button', { name: 'Set aside Read' }))
    await waitFor(() => expect(within(progress()).getByText('100% of today’s plan')).toBeTruthy())
    const list = screen.getByLabelText('Set aside tasks')
    expect(within(list).getByText('Read')).toBeTruthy()
    expect((await persisted('Read')).planState).toBe('excluded')
    await user.click(screen.getByRole('button', { name: 'Put back Read' }))
    await waitFor(() => expect(within(progress()).getByText('50% of today’s plan')).toBeTruthy())
    expect((await persisted('Read')).planState).toBe('active')
  })

  it('saves the day type', async () => {
    const user = userEvent.setup()
    renderDay()
    await screen.findByText('No tasks on this day')
    await user.click(screen.getByRole('button', { name: 'Rest day' }))
    await waitFor(async () => expect((await service.getDayPlan(TODAY)).day.dayMode).toBe('rest'))
    expect(await screen.findByText('Rest day', { selector: 'h2' })).toBeTruthy()
  })

  it('shows history older than the editing window as a record, with no editing controls', async () => {
    const user = userEvent.setup()
    renderDay('/app/day?date=2026-02-20')
    expect(await screen.findByText('No plan was recorded')).toBeTruthy()
    expect(screen.getByText(/past the editing window/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add task' })).toBeNull()
    expect(await count(db, 'day_plans', 'user_id = $1', [userId])).toBe(0)
    await user.click(screen.getByRole('button', { name: 'Back to today' }))
    expect(await screen.findByText('Today')).toBeTruthy()
  })

  it('shows a future day without creating it, and lets progress wait until it arrives', async () => {
    await service.createTemplate(daily('Walk'))
    const user = userEvent.setup()
    renderDay('/app/day?date=2026-03-12')
    expect(await screen.findByText('Nothing planned for this day yet')).toBeTruthy()
    expect(await count(db, 'day_plans', 'user_id = $1', [userId])).toBe(0)
    await user.click(screen.getByRole('button', { name: 'Start this day' }))
    expect(await screen.findByText('Walk')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Done: Walk' }).disabled).toBe(true)
  })

  it('edits a task for this day only, keeping progress, and shows validation without saving', async () => {
    await service.createTemplate(daily('Walk'))
    const user = userEvent.setup()
    renderDay()
    await screen.findByText('Walk')
    await user.click(screen.getByRole('button', { name: 'Partly: Walk' }))
    await waitFor(async () => expect((await persisted('Walk')).completion).toBe(0.5))
    await user.click(screen.getByRole('button', { name: 'Edit Walk' }))
    const form = screen.getByRole('form', { name: 'Edit Walk' })
    const title = within(form).getByRole('textbox', { name: /^Task/ })
    await user.clear(title)
    await user.click(within(form).getByRole('button', { name: 'Save changes' }))
    expect(await within(form).findByText('Give the task a title.')).toBeTruthy()
    expect((await persisted('Walk')).title).toBe('Walk')
    await user.type(title, 'Long walk')
    await user.type(within(form).getByLabelText(/Estimate in minutes/), '40')
    await user.click(within(form).getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Long walk')).toBeTruthy()
    const saved = await persisted('Long walk')
    expect(saved).toMatchObject({ completion: 0.5, estimatedMinutes: 40, isCustomized: true })
    expect(within(progress()).getByText('50% of today’s plan')).toBeTruthy()
    // The template itself is untouched: other days still get the original title.
    expect((await service.listTemplates())[0].title).toBe('Walk')
  })

  it('removes a task with confirmation; a finished task cannot be removed', async () => {
    await service.createTemplate(daily('Walk'))
    await service.createTemplate(daily('Read'))
    const user = userEvent.setup()
    renderDay()
    await screen.findByText('Walk')
    await user.click(screen.getByRole('button', { name: 'Remove Read' }))
    await user.click(await screen.findByRole('button', { name: 'Keep it' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('Read')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Remove Read' }))
    await user.click(await screen.findByRole('button', { name: 'Remove from this day' }))
    await waitFor(() => expect(screen.queryByText('Read')).toBeNull())
    expect(await persisted('Read')).toBeUndefined()
    // It stays gone when the day is reopened (the template is suppressed for this day).
    expect((await service.openDay(TODAY)).occurrences.map((o) => o.title)).toEqual(['Walk'])
    await user.click(screen.getByRole('button', { name: 'Done: Walk' }))
    await waitFor(() => expect(within(progress()).getByText('100% of today’s plan')).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Remove Walk' })).toBeNull()
  })

  it('after the plan is under way, removing an original task keeps it in the record as removed', async () => {
    await service.createTemplate(daily('Walk'))
    await service.createTemplate(daily('Read'))
    const user = userEvent.setup()
    renderDay()
    await screen.findByText('Walk')
    await user.click(screen.getByRole('button', { name: 'Partly: Walk' })) // stamps the baseline
    await waitFor(async () => expect((await service.getDayPlan(TODAY)).day.baselineAt).not.toBeNull())
    await user.click(screen.getByRole('button', { name: 'Remove Read' }))
    await user.click(await screen.findByRole('button', { name: 'Remove from this day' }))
    const list = await screen.findByLabelText('Set aside tasks')
    expect(within(list).getByText('Removed from the plan')).toBeTruthy()
    expect((await persisted('Read')).excludedReason).toBe('removed')
    expect(within(list).queryByRole('button', { name: 'Put back Read' })).toBeNull()
  })

  it('creates a repeating task that appears on later days, and can stop repeating', async () => {
    const user = userEvent.setup()
    renderDay()
    await screen.findByText('No tasks on this day')
    await user.type(screen.getByRole('textbox', { name: /^Task/ }), 'Stretch')
    await user.click(screen.getByLabelText('Repeats'))
    await user.click(await screen.findByRole('option', { name: 'Selected days of the week' }))
    await user.click(screen.getByRole('button', { name: 'Add task' }))
    expect(await screen.findByText('Choose at least one day of the week.')).toBeTruthy()
    expect(await service.listTemplates()).toHaveLength(0)
    await user.click(screen.getByRole('checkbox', { name: 'Wed' }))
    await user.click(screen.getByRole('checkbox', { name: 'Tue' }))
    await user.click(screen.getByRole('button', { name: 'Add task' }))
    expect(await screen.findByText('Stretch')).toBeTruthy() // 2026-03-10 is a Tuesday
    const [template] = await service.listTemplates()
    expect(template).toMatchObject({ title: 'Stretch', recurrence: 'weekly', weekdays: [2, 3], startsOn: TODAY })
    // Wednesday: a read-only look creates nothing; starting the day brings the task in.
    await user.click(screen.getByRole('button', { name: 'Next day' }))
    await user.click(await screen.findByRole('button', { name: 'Start this day' }))
    expect(await screen.findByText('Stretch')).toBeTruthy()
    // Stop repeating from today.
    await user.click(screen.getByRole('button', { name: 'Previous day' }))
    await screen.findByText('Stretch')
    await user.click(screen.getByRole('button', { name: 'Remove Stretch' }))
    await user.click(await screen.findByRole('button', { name: 'Stop repeating after today' }))
    await waitFor(async () => expect(await service.listTemplates()).toHaveLength(0))
    expect((await service.listTemplates({ includeArchived: true }))[0].archivedAt).not.toBeNull()
    expect(await persisted('Stretch')).toBeTruthy() // today's record is kept
  })

  it('moves a task to another day, shows where it went, and keeps My Day and the week in agreement', async () => {
    await service.createTemplate(daily('Walk'))
    await service.createTemplate(daily('Read'))
    const user = userEvent.setup()
    renderDay()
    await screen.findByText('Walk')
    await user.click(screen.getByRole('button', { name: 'Done: Walk' }))
    await user.click(screen.getByRole('button', { name: 'Move Read' }))
    const form = screen.getByRole('form', { name: 'Move Read' })
    expect(within(form).getByLabelText('Move to').value).toBe('2026-03-11')
    await user.click(within(form).getByRole('button', { name: 'Move task' }))
    const aside = await screen.findByLabelText('Set aside tasks')
    expect(within(aside).getByText('Moved to Wednesday 11 Mar')).toBeTruthy()
    await waitFor(() => expect(within(progress()).getByText('100% of today’s plan')).toBeTruthy()) // the moved task no longer counts here
    // Saved: the original is kept on its own day, the copy is linked and pending on the new day.
    const source = await persisted('Read')
    expect(source).toMatchObject({ planState: 'excluded', excludedReason: 'rescheduled' })
    const target = (await service.getDayPlan('2026-03-11')).occurrences.find((o) => o.title === 'Read')
    expect(target).toMatchObject({ planState: 'active', completion: 0, rescheduledFromId: source.id })
    // The week agrees: today has nothing left to do and Wednesday carries the task.
    const week = await service.getWeekSummary({ weekOf: TODAY })
    expect(week.days.find((d) => d.date === TODAY)).toMatchObject({ remaining: 0, setAsideCount: 1 })
    expect(week.days.find((d) => d.date === '2026-03-11').plannedCount).toBeGreaterThanOrEqual(1)
    // The new day says where it came from.
    await user.click(screen.getByRole('button', { name: 'Next day' }))
    expect(await screen.findByText('Moved from Tuesday 10 Mar')).toBeTruthy()
  })

  it('undoes a move', async () => {
    await service.createTemplate(daily('Read'))
    const user = userEvent.setup()
    renderDay()
    await screen.findByText('Read')
    await user.click(screen.getByRole('button', { name: 'Move Read' }))
    await user.click(screen.getByRole('button', { name: 'Move task' }))
    await user.click(await screen.findByRole('button', { name: 'Undo move of Read' }))
    await waitFor(() => expect(screen.queryByLabelText('Set aside tasks')).toBeNull())
    expect(screen.getByRole('button', { name: 'Move Read' })).toBeTruthy()
    expect((await persisted('Read')).planState).toBe('active')
    expect((await service.getDayPlan('2026-03-11')).occurrences.filter((o) => o.planState === 'active')).toHaveLength(0)
  })

  it('keeps progress on the original when a partly done task is moved, and cannot move a finished one', async () => {
    await service.createTemplate(daily('Walk'))
    await service.createTemplate(daily('Read'))
    const user = userEvent.setup()
    renderDay()
    await screen.findByText('Walk')
    await user.click(screen.getByRole('button', { name: 'Partly: Read' }))
    await user.click(screen.getByRole('button', { name: 'Done: Walk' }))
    expect(screen.queryByRole('button', { name: 'Move Walk' })).toBeNull() // finished tasks stay put
    await waitFor(async () => expect((await persisted('Read')).completion).toBe(0.5))
    await user.click(screen.getByRole('button', { name: 'Move Read' }))
    await user.click(screen.getByRole('button', { name: 'Move task' }))
    await screen.findByText('Moved to Wednesday 11 Mar')
    expect((await persisted('Read')).completion).toBe(0.5)
    expect((await service.getDayPlan('2026-03-11')).occurrences.find((o) => o.title === 'Read').completion).toBe(0)
  })

  it('shows a clear message and changes nothing when the move is not allowed', async () => {
    await service.createTemplate(daily('Read'))
    const user = userEvent.setup()
    renderDay()
    await screen.findByText('Read')
    await user.click(screen.getByRole('button', { name: 'Move Read' }))
    const form = screen.getByRole('form', { name: 'Move Read' })
    const date = within(form).getByLabelText('Move to')
    fireEvent.change(date, { target: { value: TODAY } })
    await user.click(within(form).getByRole('button', { name: 'Move task' }))
    expect(await within(form).findByText('Choose a different day to move this task to.')).toBeTruthy()
    fireEvent.change(date, { target: { value: '2027-06-01' } }) // further ahead than the planner holds
    await user.click(within(form).getByRole('button', { name: 'Move task' }))
    expect(await within(form).findByText('2027-06-01 is further ahead than you can plan.')).toBeTruthy()
    expect((await persisted('Read')).planState).toBe('active')
    expect(await count(db, 'task_occurrences', 'user_id = $1', [userId])).toBe(1)
    await user.click(within(form).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('form', { name: 'Move Read' })).toBeNull()
  })

  it('moving a repeating task never creates a duplicate on the target day', async () => {
    await service.createTemplate(daily('Walk'))
    const user = userEvent.setup()
    renderDay()
    await screen.findByText('Walk')
    await user.click(screen.getByRole('button', { name: 'Move Walk' }))
    await user.click(screen.getByRole('button', { name: 'Move task' }))
    await screen.findByText('Moved to Wednesday 11 Mar')
    const wednesday = await service.openDay('2026-03-11')
    expect(wednesday.occurrences.filter((o) => o.title === 'Walk' && o.planState === 'active')).toHaveLength(1)
  })

  it('never shows another user\'s tasks', async () => {
    const other = await createUser(db, `other-${(seq += 1)}@example.com`, 'America/New_York')
    const otherService = createPlannerService({ getClient: () => createPgliteClient(db, { getUserId: () => other }), clock: () => Date.parse(CLOCK) })
    await otherService.createTemplate(daily('Secret task'))
    await otherService.openDay(TODAY)
    renderDay()
    expect(await screen.findByText('No tasks on this day')).toBeTruthy()
    expect(screen.queryByText('Secret task')).toBeNull()
  })

  it('shows a calm error with retry when loading fails, and recovers', async () => {
    const user = userEvent.setup()
    const real = holder.service
    const getToday = vi.fn(real.getToday).mockRejectedValueOnce(new Error('relation "day_plans" does not exist'))
    holder.service = { ...real, getToday, getDayPlan: real.getDayPlan, openDay: real.openDay }
    renderDay()
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText(/relation/)).toBeNull()
    await user.click(screen.getByRole('button', { name: /Try again/ }))
    expect(await screen.findByText('Today')).toBeTruthy()
  })
})
