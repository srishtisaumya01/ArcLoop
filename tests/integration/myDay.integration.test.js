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

// UI -> hook -> REAL planner service -> the real Django API and its SQLite database.
// Not a browser.
const holder = vi.hoisted(() => ({ service: null }))
vi.mock('../../src/services/planner/index.js', () => ({
  plannerService: new Proxy({}, { get: (_, name) => (...args) => holder.service[name](...args) }),
}))

const { default: MyDayPage } = await import('../../src/pages/app/MyDayPage.jsx')

let world
let seq = 0
beforeAll(() => {
  world = createWorld(CLOCK)
})

let userId
let service
beforeEach(async () => {
  userId = await createUser(world, `myday-${(seq += 1)}@example.com`, 'America/New_York')
  const client = createTestClient(world, { getUserId: () => userId })
  service = createPlannerService({ getClient: () => client, clock: () => Date.parse(CLOCK) })
  holder.service = service
  localStorage.clear() // dismissals (welcome-back, day-mode offers) are per browser and must not leak between tests
})

const daily = (title, extra = {}) => ({ title, recurrence: 'daily', startsOn: '2026-03-01', ...extra })
const renderDay = (path = '/app/day') =>
  render(h(ThemeProvider, { theme }, h(MemoryRouter, { initialEntries: [path] }, h(MyDayPage))))
const progress = () => screen.getByLabelText('Day progress', { selector: 'section' })
const box = (title) => screen.getByRole('checkbox', { name: `Done: ${title}` })
const findBox = (title) => screen.findByRole('checkbox', { name: `Done: ${title}` })
// "Partly" lives in Edit: open the task's edit form, choose Partly, save.
async function markPartly(user, title) {
  await user.click(screen.getByRole('button', { name: `Edit ${title}` }))
  const form = screen.getByRole('form', { name: `Edit ${title}` })
  await user.click(within(form).getByRole('button', { name: 'Partly' }))
  await user.click(within(form).getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(screen.queryByRole('form', { name: `Edit ${title}` })).toBeNull())
}
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
    expect(await countRows(world, userId, 'task-occurrences')).toBe(2)
  })

  it('ticks a task done and back, sets partly done from Edit, saves them, and updates progress', async () => {
    await service.createTemplate(daily('Walk'))
    await service.createTemplate(daily('Read'))
    const user = setupUser()
    renderDay()
    await screen.findByText('Walk')
    await user.click(box('Walk'))
    await waitFor(() => expect(within(progress()).getByText('50% of today’s plan')).toBeTruthy())
    expect(box('Walk').checked).toBe(true)
    expect((await persisted('Walk')).completion).toBe(1)
    expect((await persisted('Walk')).completedAt).not.toBeNull()
    await markPartly(user, 'Read')
    await waitFor(() => expect(within(progress()).getByText('75% of today’s plan')).toBeTruthy())
    expect((await persisted('Read')).completion).toBe(0.5)
    expect(box('Read').indeterminate).toBe(true) // a dash: partly done
    // Unticking goes back to not done and clears the stamp.
    await user.click(box('Walk'))
    await waitFor(() => expect(within(progress()).getByText('25% of today’s plan')).toBeTruthy())
    expect((await persisted('Walk')).completion).toBe(0)
  })

  it('quick-adds a task with just a title, with validation shown for an empty one', async () => {
    const user = setupUser()
    renderDay()
    expect(await screen.findByText('No tasks on this day')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Add task' }))
    expect(await screen.findByText('Give the task a title.')).toBeTruthy()
    expect(await countRows(world, userId, 'task-occurrences')).toBe(0)
    await user.type(screen.getByRole('textbox', { name: 'Task' }), 'Call the dentist')
    await user.click(screen.getByRole('button', { name: 'Add task' }))
    expect(await screen.findByText('Call the dentist')).toBeTruthy()
    expect(await persisted('Call the dentist')).toMatchObject({ planState: 'active', completion: 0, estimatedMinutes: null, plannedStart: null })
    expect(screen.queryByText('Give the task a title.')).toBeNull()
    expect((screen.getByRole('textbox', { name: 'Task' })).value).toBe('') // ready for the next one
  })

  it('sets a task aside and puts it back; set-aside tasks leave the progress maths', async () => {
    await service.createTemplate(daily('Walk'))
    await service.createTemplate(daily('Read'))
    const user = setupUser()
    renderDay()
    await screen.findByText('Walk')
    await user.click(box('Walk'))
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
    const user = setupUser()
    renderDay()
    await screen.findByText('No tasks on this day')
    await user.click(screen.getByRole('button', { name: 'Rest day' }))
    await waitFor(async () => expect((await service.getDayPlan(TODAY)).day.dayMode).toBe('rest'))
    expect(await screen.findByText('Rest day', { selector: 'h2' })).toBeTruthy()
  })

  it('shows history older than the editing window as a record, with no editing controls', async () => {
    const user = setupUser()
    renderDay('/app/day?date=2026-02-20')
    expect(await screen.findByText('No plan was recorded')).toBeTruthy()
    expect(screen.getByText(/past the editing window/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add task' })).toBeNull()
    expect(await countRows(world, userId, 'day-plans')).toBe(0)
    await user.click(screen.getByRole('button', { name: 'Back to today' }))
    expect(await screen.findByText('Today')).toBeTruthy()
  })

  it('shows a future day without creating it, and lets progress wait until it arrives', async () => {
    await service.createTemplate(daily('Walk'))
    const user = setupUser()
    renderDay('/app/day?date=2026-03-12')
    expect(await screen.findByText('Nothing planned for this day yet')).toBeTruthy()
    expect(await countRows(world, userId, 'day-plans')).toBe(0)
    await user.click(screen.getByRole('button', { name: 'Start this day' }))
    expect(await screen.findByText('Walk')).toBeTruthy()
    expect((await findBox('Walk')).disabled).toBe(true)
  })

  it('edits a task for this day only, keeping progress, and shows validation without saving', async () => {
    await service.createTemplate(daily('Walk'))
    const user = setupUser()
    renderDay()
    await screen.findByText('Walk')
    await markPartly(user, 'Walk')
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

  it('edits a task\'s description, category and end time for this day, with the planner\'s own validation', async () => {
    await service.createTemplate(daily('Walk', { plannedStart: '07:00' }))
    const user = setupUser()
    renderDay()
    await screen.findByText('Walk')
    await user.click(screen.getByRole('button', { name: 'Edit Walk' }))
    const form = screen.getByRole('form', { name: 'Edit Walk' })
    const end = within(form).getByLabelText(/End time/)
    // An end before the start is refused by the planner and shown under the end-time field; nothing is saved.
    fireEvent.change(end, { target: { value: '06:30' } })
    await user.click(within(form).getByRole('button', { name: 'Save changes' }))
    expect(await within(form).findByText('The end time needs to be after the start time.')).toBeTruthy()
    expect((await persisted('Walk')).plannedEnd).toBeNull()
    fireEvent.change(end, { target: { value: '07:45' } })
    await user.type(within(form).getByLabelText(/Category/), 'Health')
    await user.type(within(form).getByLabelText(/Description/), 'Round the park, no phone.')
    await user.click(within(form).getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Round the park, no phone.')).toBeTruthy()
    expect(await screen.findByText('07:00 to 07:45 · Health · repeats')).toBeTruthy()
    expect(await persisted('Walk')).toMatchObject({ plannedStart: '07:00', plannedEnd: '07:45', category: 'Health', description: 'Round the park, no phone.', isCustomized: true })
    // The repeating task itself is untouched: it is a change for this day only.
    expect((await service.listTemplates())[0]).toMatchObject({ plannedEnd: null, category: null, description: null })
    // Clearing the start time while an end time remains is refused with the planner's message.
    await user.click(screen.getByRole('button', { name: 'Edit Walk' }))
    const again = screen.getByRole('form', { name: 'Edit Walk' })
    fireEvent.change(within(again).getByLabelText(/Start time/), { target: { value: '' } })
    await user.click(within(again).getByRole('button', { name: 'Save changes' }))
    expect(await within(again).findByText('Add a start time first.')).toBeTruthy()
    expect((await persisted('Walk')).plannedStart).toBe('07:00')
  })

  it('removes a task with confirmation; a finished task cannot be removed', async () => {
    await service.createTemplate(daily('Walk'))
    await service.createTemplate(daily('Read'))
    const user = setupUser()
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
    await user.click(box('Walk'))
    await waitFor(() => expect(within(progress()).getByText('100% of today’s plan')).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Remove Walk' })).toBeNull()
  })

  it('after the plan is under way, removing an original task keeps it in the record as removed', async () => {
    await service.createTemplate(daily('Walk'))
    await service.createTemplate(daily('Read'))
    const user = setupUser()
    renderDay()
    await screen.findByText('Walk')
    await markPartly(user, 'Walk') // stamps the baseline
    await waitFor(async () => expect((await service.getDayPlan(TODAY)).day.baselineAt).not.toBeNull())
    await user.click(screen.getByRole('button', { name: 'Remove Read' }))
    await user.click(await screen.findByRole('button', { name: 'Remove from this day' }))
    const list = await screen.findByLabelText('Set aside tasks')
    expect(within(list).getByText('Removed from the plan')).toBeTruthy()
    expect((await persisted('Read')).excludedReason).toBe('removed')
    expect(within(list).queryByRole('button', { name: 'Put back Read' })).toBeNull()
  })

  it('a repeating task appears on later days, and can stop repeating', async () => {
    await service.createTemplate({ title: 'Stretch', recurrence: 'weekly', weekdays: [2, 3], startsOn: TODAY })
    const user = setupUser()
    renderDay()
    expect(await screen.findByText('Stretch')).toBeTruthy() // 2026-03-10 is a Tuesday
    expect(screen.queryByLabelText('Repeats')).toBeNull() // My Day's quick add has no repeat options: repeating tasks are made on the Recurring tasks page
    // Wednesday: a read-only look creates nothing; starting the day brings the task in.
    await user.click(screen.getByRole('button', { name: 'Next day' }))
    await user.click(await screen.findByRole('button', { name: 'Start this day' }))
    expect(await screen.findByText('Stretch')).toBeTruthy()
    // Stop repeating from today.
    await user.click(screen.getByRole('button', { name: 'Previous day' }))
    await screen.findByText('Stretch')
    await user.click(await screen.findByRole('button', { name: 'Remove Stretch' }))
    await user.click(await screen.findByRole('button', { name: 'Stop repeating after today' }))
    await waitFor(async () => expect(await service.listTemplates()).toHaveLength(0))
    expect((await service.listTemplates({ includeArchived: true }))[0].archivedAt).not.toBeNull()
    expect(await persisted('Stretch')).toBeTruthy() // today's record is kept
  })

  it('moves a task to another day, shows where it went, and keeps My Day and the week in agreement', async () => {
    await service.createTemplate(daily('Walk'))
    await service.createTemplate(daily('Read'))
    const user = setupUser()
    renderDay()
    await screen.findByText('Walk')
    await user.click(box('Walk'))
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
    const user = setupUser()
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
    const user = setupUser()
    renderDay()
    await screen.findByText('Walk')
    await markPartly(user, 'Read')
    await user.click(box('Walk'))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Move Walk' })).toBeNull()) // finished tasks stay put
    await waitFor(async () => expect((await persisted('Read')).completion).toBe(0.5))
    await user.click(screen.getByRole('button', { name: 'Move Read' }))
    await user.click(screen.getByRole('button', { name: 'Move task' }))
    await screen.findByText('Moved to Wednesday 11 Mar')
    expect((await persisted('Read')).completion).toBe(0.5)
    expect((await service.getDayPlan('2026-03-11')).occurrences.find((o) => o.title === 'Read').completion).toBe(0)
  })

  it('shows a clear message and changes nothing when the move is not allowed', async () => {
    await service.createTemplate(daily('Read'))
    const user = setupUser()
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
    expect(await countRows(world, userId, 'task-occurrences')).toBe(1)
    await user.click(within(form).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('form', { name: 'Move Read' })).toBeNull()
  })

  it('moving a repeating task never creates a duplicate on the target day', async () => {
    await service.createTemplate(daily('Walk'))
    const user = setupUser()
    renderDay()
    await screen.findByText('Walk')
    await user.click(screen.getByRole('button', { name: 'Move Walk' }))
    await user.click(screen.getByRole('button', { name: 'Move task' }))
    await screen.findByText('Moved to Wednesday 11 Mar')
    const wednesday = await service.openDay('2026-03-11')
    expect(wednesday.occurrences.filter((o) => o.title === 'Walk' && o.planState === 'active')).toHaveLength(1)
  })

  it('lets someone add repeating tasks to a future day that already exists, without duplicates', async () => {
    // Found by the end-to-end journey: moving a task to tomorrow creates tomorrow, which then had no way to
    // bring in tomorrow's repeating tasks until the day itself arrived.
    await service.createTemplate(daily('Stretch'))
    await service.createTask(TODAY, { title: 'Email Sam' })
    const user = setupUser()
    renderDay()
    await screen.findByText('Email Sam')
    await user.click(screen.getByRole('button', { name: 'Move Email Sam' }))
    await user.click(screen.getByRole('button', { name: 'Move task' }))
    await screen.findByText('Moved to Wednesday 11 Mar')
    expect(screen.queryByRole('button', { name: 'Add my repeating tasks' })).toBeNull() // not offered on today
    await user.click(screen.getByRole('button', { name: 'Next day' }))
    expect(await screen.findByText('Moved from Tuesday 10 Mar')).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: 'Done: Stretch', exact: true })).toBeNull() // tomorrow exists, but without its repeating tasks
    expect(within(screen.getByLabelText('Repeating tasks to add')).getByText('Stretch')).toBeTruthy() // the preview says what the action will add
    await user.click(screen.getByRole('button', { name: 'Add my repeating tasks' }))
    expect(await screen.findByText('Stretch')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Add my repeating tasks' })).toBeNull()) // nothing left to add, so it is no longer offered
    await service.openDay('2026-03-11') // and opening again (the action's own operation) adds nothing more
    await waitFor(async () => expect((await service.getDayPlan('2026-03-11')).occurrences.map((o) => o.title).sort()).toEqual(['Email Sam', 'Stretch']))
    expect(screen.getAllByText('Stretch')).toHaveLength(1)
  })

  describe('Busy and Rest days: guided set-aside (suggestion only)', () => {
    const states = async () => Object.fromEntries((await service.getDayPlan(TODAY)).occurrences.map((o) => [o.title, [o.planState, o.excludedReason]]))
    const seed = async () => {
      await service.createTemplate(daily('Walk'))
      await service.createTemplate(daily('Read'))
      await service.createTask(TODAY, { title: 'Pay rent', isPriority: true })
    }

    it('Busy: shows the calm message and a proposal, but changes nothing until the person chooses', async () => {
      await seed()
      const user = setupUser()
      renderDay()
      await screen.findByText('Walk')
      await user.click(screen.getByRole('button', { name: 'Busy' }))
      const panel = await screen.findByRole('region', { name: 'Busy day' })
      expect(within(panel).getByText('Keep what matters today. The rest can wait.')).toBeTruthy()
      expect(within(panel).getAllByRole('listitem').map((li) => li.textContent).sort()).toEqual(['Read', 'Walk']) // priority task is not proposed
      expect(await states()).toEqual({ Walk: ['active', null], Read: ['active', null], 'Pay rent': ['active', null] })
    })

    it('Busy: setting the proposal aside keeps priority tasks, keeps the original plan, and is reversible', async () => {
      await seed()
      const user = setupUser()
      renderDay()
      await screen.findByText('Walk')
      await user.click(box('Pay rent'))
      await waitFor(() => expect(within(progress()).getByText('33% of today’s plan')).toBeTruthy())
      await user.click(screen.getByRole('button', { name: 'Busy' }))
      await user.click(await screen.findByRole('button', { name: 'Set these aside' }))
      await waitFor(() => expect(within(progress()).getByText('100% of today’s plan')).toBeTruthy()) // 1 of 1 remaining
      expect(await states()).toEqual({ Walk: ['excluded', 'busy_day'], Read: ['excluded', 'busy_day'], 'Pay rent': ['active', null] })
      expect(screen.getByText(/Against the original plan: 33%/)).toBeTruthy() // the original plan is still shown
      const aside = screen.getByLabelText('Set aside tasks')
      expect(within(aside).getByText('Walk')).toBeTruthy()
      await user.click(within(aside).getByRole('button', { name: 'Put back Walk' }))
      await waitFor(async () => expect((await states()).Walk).toEqual(['active', null]))
    })

    it('Rest: proposes every open task (including priority), never a finished one, and says rest is part of the plan', async () => {
      await seed()
      const user = setupUser()
      renderDay()
      await screen.findByText('Walk')
      await user.click(box('Walk'))
      await user.click(screen.getByRole('button', { name: 'Rest day' }))
      const panel = await screen.findByRole('region', { name: 'Rest day' })
      expect(within(panel).getByText('Rest is part of the plan.')).toBeTruthy()
      expect(within(panel).getAllByRole('listitem').map((li) => li.textContent).sort()).toEqual(['Pay rent', 'Read'])
      await user.click(within(panel).getByRole('button', { name: 'Set them aside' }))
      await waitFor(async () => expect(await states()).toEqual({ Walk: ['active', null], Read: ['excluded', 'rest_day'], 'Pay rent': ['excluded', 'rest_day'] }))
    })

    it('"Keep them all" changes nothing and stays hidden for that day and mode', async () => {
      await seed()
      const user = setupUser()
      const first = renderDay()
      await screen.findByText('Walk')
      await user.click(screen.getByRole('button', { name: 'Busy' }))
      await user.click(await screen.findByRole('button', { name: 'Keep them all' }))
      expect(screen.queryByRole('button', { name: 'Set these aside' })).toBeNull()
      expect(screen.getByText('Keep what matters today. The rest can wait.')).toBeTruthy() // the message stays
      expect(await states()).toEqual({ Walk: ['active', null], Read: ['active', null], 'Pay rent': ['active', null] })
      first.unmount()
      renderDay()
      await screen.findByText('Walk')
      await new Promise((r) => setTimeout(r, 300))
      expect(screen.queryByRole('button', { name: 'Set these aside' })).toBeNull()
    })

    it('switching back to Normal removes the panel and touches no task', async () => {
      await seed()
      const user = setupUser()
      renderDay()
      await screen.findByText('Walk')
      await user.click(screen.getByRole('button', { name: 'Busy' }))
      await user.click(await screen.findByRole('button', { name: 'Set these aside' }))
      await waitFor(async () => expect((await states()).Walk[0]).toBe('excluded'))
      await user.click(screen.getByRole('button', { name: 'Normal' }))
      await waitFor(() => expect(screen.queryByRole('region', { name: 'Busy day' })).toBeNull())
      expect(await states()).toEqual({ Walk: ['excluded', 'busy_day'], Read: ['excluded', 'busy_day'], 'Pay rent': ['active', null] })
    })

    it('if setting aside fails part-way, what was done stays, the error is calm, and the rest can be retried', async () => {
      await seed()
      const real = holder.service
      let calls = 0
      holder.service = { ...real, setAside: (...args) => (++calls === 2 ? Promise.reject(new Error('connection reset')) : real.setAside(...args)) }
      const user = setupUser()
      renderDay()
      await screen.findByText('Walk')
      await user.click(screen.getByRole('button', { name: 'Busy' }))
      await user.click(await screen.findByRole('button', { name: 'Set these aside' }))
      expect(await screen.findAllByRole('alert')).not.toHaveLength(0)
      const after = await states()
      expect(Object.values(after).filter(([state]) => state === 'excluded')).toHaveLength(1) // exactly one made it
      holder.service = real
      const panel = await screen.findByRole('region', { name: 'Busy day' })
      expect(within(panel).getAllByRole('listitem')).toHaveLength(1) // only the remaining one is still proposed
      await user.click(within(panel).getByRole('button', { name: 'Set these aside' }))
      await waitFor(async () => expect(Object.values(await states()).filter(([state]) => state === 'excluded')).toHaveLength(2))
    })
  })

  it('the Week counts repeating tasks on days not opened yet, without creating anything, and never twice', async () => {
    await service.createTemplate(daily('Walk'))
    await service.createTemplate({ title: 'Gym', recurrence: 'weekly', weekdays: [4], startsOn: '2026-03-01' }) // Thursdays
    const before = await countRows(world, userId, 'day-plans')
    let week = await service.getWeekSummary()
    // Today (unopened) and Wed..Sun: Walk every day, Gym on Thursday the 12th.
    expect(week.days.filter((d) => d.kind === 'upcoming').map((d) => d.plannedCount)).toEqual([1, 1, 2, 1, 1, 1])
    expect(week.upcomingTasks).toBe(6) // after today
    expect(week.tasksRemaining).toBe(1) // today's walk, not started
    expect(await countRows(world, userId, 'day-plans')).toBe(before) // a display count creates no records
    // Opening Thursday makes its tasks real; the count stays the same.
    await service.openDay('2026-03-12')
    week = await service.getWeekSummary()
    expect(week.days.find((d) => d.date === '2026-03-12')).toMatchObject({ plannedCount: 2, expectedCount: 0 })
    expect(week.upcomingTasks).toBe(6)
    // Removing Walk from Thursday (pre-baseline: deleted and suppressed) takes it out of the count for that day only.
    await service.removeOccurrence((await service.getDayPlan('2026-03-12')).occurrences.find((o) => o.title === 'Walk').id)
    week = await service.getWeekSummary()
    expect(week.days.find((d) => d.date === '2026-03-12').plannedCount).toBe(1)
    expect(week.upcomingTasks).toBe(5)
    // The screen shows it: an unopened Friday reads as planned.
    renderDay()
    await screen.findByText('Walk')
  })

  describe('previewing repeating tasks before a day is opened', () => {
    const previewTitles = () => within(screen.getByLabelText('Repeating tasks to add')).getAllByRole('listitem').map((li) => li.textContent)

    it('an unopened day lists exactly what "Start this day" will add, and adding creates no duplicates', async () => {
      await service.createTemplate(daily('Walk', { plannedStart: '07:00' }))
      await service.createTemplate({ title: 'Gym', recurrence: 'weekly', weekdays: [4], startsOn: '2026-03-01' }) // Thursdays only
      const user = setupUser()
      renderDay('/app/day?date=2026-03-12') // Thursday, never opened
      expect(await screen.findByText('Nothing planned for this day yet')).toBeTruthy()
      expect(previewTitles()).toEqual(['Walk · 07:00', 'Gym'])
      expect(await countRows(world, userId, 'day-plans')).toBe(0) // the preview created nothing
      await user.click(screen.getByRole('button', { name: 'Start this day' }))
      await waitFor(async () => expect((await service.getDayPlan('2026-03-12')).occurrences.map((o) => o.title).sort()).toEqual(['Gym', 'Walk']))
      await waitFor(() => expect(screen.queryByLabelText('Repeating tasks to add')).toBeNull()) // nothing left to add
      expect(screen.queryByRole('button', { name: 'Add my repeating tasks' })).toBeNull()
      renderDay('/app/day?date=2026-03-13') // Friday: no gym
      await waitFor(() => expect(screen.getAllByLabelText('Repeating tasks to add').at(-1).textContent).toBe('Walk · 07:00'))
    })

    it('a day with no repeating tasks says so and can still be started', async () => {
      const user = setupUser()
      renderDay('/app/day?date=2026-03-12')
      expect(await screen.findByText(/No repeating tasks fall on this day/)).toBeTruthy()
      expect(screen.queryByLabelText('Repeating tasks to add')).toBeNull()
      await user.click(screen.getByRole('button', { name: 'Start this day' }))
      expect(await screen.findByText('No tasks on this day')).toBeTruthy()
    })

    it('an opened future day only offers "Add my repeating tasks" for templates created after its record, listing them', async () => {
      await service.createTemplate(daily('Walk'))
      await service.openDay('2026-03-12')
      const user = setupUser()
      const first = renderDay('/app/day?date=2026-03-12')
      await screen.findByText('Walk')
      expect(screen.queryByRole('button', { name: 'Add my repeating tasks' })).toBeNull() // everything due is already there
      first.unmount()
      await service.createTemplate(daily('Stretch')) // created after Thursday's record
      renderDay('/app/day?date=2026-03-12')
      await screen.findByText('Walk')
      expect(await screen.findByRole('button', { name: 'Add my repeating tasks' })).toBeTruthy()
      expect(previewTitles()).toEqual(['Stretch'])
      await user.click(screen.getByRole('button', { name: 'Add my repeating tasks' }))
      expect(await screen.findByText('Stretch')).toBeTruthy()
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Add my repeating tasks' })).toBeNull())
      expect((await service.getDayPlan('2026-03-12')).occurrences.map((o) => o.title).sort()).toEqual(['Stretch', 'Walk'])
      expect(await countRows(world, userId, 'task-occurrences', { plan_date: '2026-03-12' })).toBe(2) // no duplicates
    })

    it('today is topped up whenever My Day opens it (spec D10), so a later template simply appears', async () => {
      await service.createTemplate(daily('Walk'))
      const first = renderDay()
      await screen.findByText('Walk')
      first.unmount()
      await service.createTemplate(daily('Stretch'))
      renderDay()
      expect(await screen.findByText('Stretch')).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Add my repeating tasks' })).toBeNull()
      expect(await countRows(world, userId, 'task-occurrences', { plan_date: TODAY })).toBe(2)
    })
  })

  it('never shows another user\'s tasks', async () => {
    const other = await createUser(world, `other-${(seq += 1)}@example.com`, 'America/New_York')
    const otherService = createPlannerService({ getClient: () => createTestClient(world, { getUserId: () => other }), clock: () => Date.parse(CLOCK) })
    await otherService.createTemplate(daily('Secret task'))
    await otherService.openDay(TODAY)
    renderDay()
    expect(await screen.findByText('No tasks on this day')).toBeTruthy()
    expect(screen.queryByText('Secret task')).toBeNull()
  })

  it('shows a calm error with retry when loading fails, and recovers', async () => {
    const user = setupUser()
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


describe('Minimum Day on My Day, against the real service and database', () => {
  const panel = () => screen.getByRole('region', { name: 'Minimum Day' })

  it('chooses a minimum, shows it on the task, and leaves the day percentage alone as it is completed', async () => {
    for (const title of ['Walk', 'Read', 'Write', 'Tidy']) await service.createTemplate(daily(title))
    const user = setupUser()
    renderDay()
    await screen.findByText('Walk')
    expect(within(panel()).getByText('Choose a few important tasks to keep your day moving.')).toBeTruthy()
    await user.click(within(panel()).getByRole('button', { name: 'Choose your minimum' }))
    await user.click(within(panel()).getByRole('checkbox', { name: 'Walk' }))
    await user.click(within(panel()).getByRole('checkbox', { name: 'Read' }))
    await user.click(within(panel()).getByRole('button', { name: 'Save minimum' }))
    await within(panel()).findByRole('list', { name: 'Your minimum tasks' })
    expect(within(panel()).getByRole('status').textContent).toBe('Your minimum is still here whenever you’re ready.')
    expect((await persisted('Walk')).isMinimum).toBe(true)
    expect((await persisted('Write')).isMinimum).toBe(false)
    expect(within(progress()).getByText('0% of today’s plan')).toBeTruthy()

    await user.click(box('Walk'))
    await waitFor(() => expect(within(progress()).getByText('25% of today’s plan')).toBeTruthy())
    await user.click(box('Read'))
    await waitFor(() => expect(within(panel()).getByRole('status').textContent).toBe('You showed up for yourself today.'))
    expect(within(progress()).getByText('50% of today’s plan')).toBeTruthy() // the minimum done is not the day done
    expect(within(panel()).getByText('2 of 2 done')).toBeTruthy()
    expect((await persisted('Write')).completion).toBe(0)
  })

  it('stops at three choices, and keeps the tasks the person chose when a Busy day proposes setting others aside', async () => {
    for (const title of ['A', 'B', 'C', 'D']) await service.createTemplate(daily(title))
    const user = setupUser()
    renderDay()
    await screen.findByText('A')
    await user.click(within(panel()).getByRole('button', { name: 'Choose your minimum' }))
    for (const title of ['A', 'B', 'C']) await user.click(within(panel()).getByRole('checkbox', { name: title }))
    expect(within(panel()).getByRole('checkbox', { name: 'D' }).disabled).toBe(true)
    await user.click(within(panel()).getByRole('button', { name: 'Save minimum' }))
    await within(panel()).findByRole('list', { name: 'Your minimum tasks' })

    await user.click(screen.getByRole('button', { name: 'Busy' }))
    const offer = await screen.findByRole('list', { name: 'Tasks proposed for setting aside' })
    expect(within(offer).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['D']) // never the minimum
    expect((await service.getDayPlan(TODAY)).occurrences.every((o) => o.planState === 'active')).toBe(true) // nothing moved by itself
  })

  it('can be cleared, and clearing deletes or skips nothing', async () => {
    await service.createTemplate(daily('Walk'))
    const user = setupUser()
    renderDay()
    await screen.findByText('Walk')
    await user.click(within(panel()).getByRole('button', { name: 'Choose your minimum' }))
    await user.click(within(panel()).getByRole('checkbox', { name: 'Walk' }))
    await user.click(within(panel()).getByRole('button', { name: 'Save minimum' }))
    await user.click(await within(panel()).findByRole('button', { name: 'Clear minimum' }))
    await waitFor(() => expect(within(panel()).getByText('You haven’t chosen a minimum for this day. That is fine.')).toBeTruthy())
    expect((await persisted('Walk')).planState).toBe('active')
    expect(await countRows(world, userId, 'task-occurrences')).toBe(1)
  })

  it('is per day: another date does not inherit it, and a day that does not exist yet shows no panel', async () => {
    await service.createTemplate(daily('Walk'))
    const today = await service.openDay(TODAY)
    await service.setMinimum(TODAY, [today.occurrences[0].id])
    renderDay('/app/day?date=2026-03-11')
    expect(await screen.findByText('Nothing planned for this day yet')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Minimum Day' })).toBeNull() // the day does not exist yet: nothing to choose from
  })

  it('shows a minimum on history outside the editing window as a record, with no controls', async () => {
    await service.createTask(TODAY, { title: 'Keeper' })
    const today = await service.openDay(TODAY)
    await service.setMinimum(TODAY, [today.occurrences[0].id])
    holder.service = createPlannerService({ getClient: () => createTestClient(world, { getUserId: () => userId }), clock: () => Date.parse('2026-03-20T15:00:00Z') })
    renderDay(`/app/day?date=${TODAY}`)
    const record = await screen.findByRole('region', { name: 'Minimum Day' })
    expect(within(record).getByText(/Keeper · Not done/)).toBeTruthy()
    expect(within(record).queryByRole('button')).toBeNull()
  })
})
