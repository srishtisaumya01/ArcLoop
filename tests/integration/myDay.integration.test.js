import { createElement as h } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { setupUser } from './user.js'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import theme from '../../src/theme/theme.js'
import { AuthContext } from '../../src/context/authContext.js'
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
let failNext = null // (state) => boolean: the next matching request fails, as a dropped connection would
let updates = 0 // writes to the occurrences, counted
beforeEach(async () => {
  userId = await createUser(world, `myday-${(seq += 1)}@example.com`, 'America/New_York')
  failNext = null
  updates = 0
  const hooks = {
    before: async (state) => {
      if (state.table === 'task_occurrences' && state.op === 'update') updates += 1
      if (failNext && failNext(state)) {
        failNext = null
        throw new Error('Failed to fetch')
      }
    },
  }
  const client = createTestClient(world, { getUserId: () => userId, hooks })
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


describe('Undo on My Day, against the real service and database', () => {
  const doneNotice = (title) => `“${title}” marked done.`
  const undoButton = (title) => screen.getByRole('button', { name: `Undo: ${title} marked done` })
  const writesToTasks = (state) => state.table === 'task_occurrences' && state.op === 'update'

  it('ticking a task offers Undo; Undo puts it back, and what is shown is what the server holds', async () => {
    await service.createTemplate(daily('Walk'))
    await service.createTemplate(daily('Read'))
    const user = setupUser()
    renderDay()
    await screen.findByText('Walk')
    await user.click(box('Walk'))
    expect(await screen.findByText(doneNotice('Walk'))).toBeTruthy()
    expect((await persisted('Walk')).completion).toBe(1)
    await user.click(undoButton('Walk'))
    await waitFor(() => expect(screen.queryByText(doneNotice('Walk'))).toBeNull())
    expect(box('Walk').checked).toBe(false)
    expect((await persisted('Walk')).completion).toBe(0)
    expect((await persisted('Walk')).completedAt).toBeNull()
    expect(within(progress()).getByText('0% of today’s plan')).toBeTruthy()
  })

  it('Undo restores a partly done task to partly done', async () => {
    await service.createTemplate(daily('Walk'))
    const user = setupUser()
    renderDay()
    await screen.findByText('Walk')
    await markPartly(user, 'Walk')
    await user.click(box('Walk')) // a dash: one tick finishes it
    expect(await screen.findByText(doneNotice('Walk'))).toBeTruthy()
    await user.click(undoButton('Walk'))
    await waitFor(() => expect(box('Walk').indeterminate).toBe(true))
    expect((await persisted('Walk')).completion).toBe(0.5)
  })

  it('unticking a task does not offer Undo, and a refused tick does not claim success', async () => {
    await service.createTemplate(daily('Walk'))
    const user = setupUser()
    renderDay()
    await screen.findByText('Walk')
    failNext = writesToTasks
    await user.click(box('Walk'))
    expect(await screen.findByRole('alert')).toBeTruthy() // the page says it did not save
    expect(screen.queryByText(doneNotice('Walk'))).toBeNull() // no notice for something that did not happen
    expect((await persisted('Walk')).completion).toBe(0)
    await user.click(box('Walk'))
    await screen.findByText(doneNotice('Walk'))
    await user.click(box('Walk')) // unticking by hand
    await waitFor(() => expect(screen.queryByText(doneNotice('Walk'))).toBeNull()) // the notice no longer describes the screen
  })

  it('with several tasks ticked in succession, the notice is for the latest only and Undo touches only that task', async () => {
    for (const title of ['Walk', 'Read', 'Write']) await service.createTemplate(daily(title))
    const user = setupUser()
    renderDay()
    await screen.findByText('Walk')
    await user.click(box('Walk'))
    await screen.findByText(doneNotice('Walk'))
    await user.click(box('Read'))
    expect(await screen.findByText(doneNotice('Read'))).toBeTruthy()
    expect(screen.queryByText(doneNotice('Walk'))).toBeNull()
    expect(screen.getAllByRole('button', { name: /^Undo:/ })).toHaveLength(1)
    await user.click(undoButton('Read'))
    await waitFor(() => expect(box('Read').checked).toBe(false))
    expect(box('Walk').checked).toBe(true) // the earlier one is untouched
    expect((await persisted('Walk')).completion).toBe(1)
    expect((await persisted('Write')).completion).toBe(0)
  })

  it('a failed Undo says so, keeps the task as the server has it, and Try again works', async () => {
    await service.createTemplate(daily('Walk'))
    const user = setupUser()
    renderDay()
    await screen.findByText('Walk')
    await user.click(box('Walk'))
    await screen.findByText(doneNotice('Walk'))
    failNext = writesToTasks
    await user.click(undoButton('Walk'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).not.toMatch(/marked done/) // no false success, and no stale message either
    expect(box('Walk').checked).toBe(true)
    expect((await persisted('Walk')).completion).toBe(1)
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(box('Walk').checked).toBe(false)) // shown only once the server has confirmed it
    expect(screen.queryByRole('alert')).toBeNull()
    expect((await persisted('Walk')).completion).toBe(0)
  })

  it('if the task changed somewhere else, Undo says so plainly and does not overwrite it', async () => {
    await service.createTemplate(daily('Walk'))
    const user = setupUser()
    renderDay()
    await screen.findByText('Walk')
    await user.click(box('Walk'))
    await screen.findByText(doneNotice('Walk'))
    await service.setCompletion((await persisted('Walk')).id, 0.5) // another tab
    await user.click(undoButton('Walk'))
    expect(await screen.findByText('That task changed since. Reload to see where it is now.')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText(doneNotice('Walk'))).toBeNull())
    expect((await persisted('Walk')).completion).toBe(0.5)
    await waitFor(() => expect(box('Walk').indeterminate).toBe(true)) // the screen shows where it is now
  })

  it('pressing Undo twice in a row sends one request', async () => {
    await service.createTemplate(daily('Walk'))
    const user = setupUser()
    renderDay()
    await screen.findByText('Walk')
    await user.click(box('Walk'))
    await screen.findByText(doneNotice('Walk'))
    const before = updates
    const button = undoButton('Walk')
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(box('Walk').checked).toBe(false))
    expect(updates - before).toBe(1)
    expect((await persisted('Walk')).completion).toBe(0)
  })

  it('moving to another day ends the notice: it only ever describes the day on screen', async () => {
    await service.createTemplate(daily('Walk'))
    const user = setupUser()
    renderDay()
    await screen.findByText('Walk')
    await user.click(box('Walk'))
    await screen.findByText(doneNotice('Walk'))
    await user.click(screen.getByRole('button', { name: 'Previous day' }))
    await waitFor(() => expect(screen.queryByText(doneNotice('Walk'))).toBeNull())
  })

  it('works from the keyboard: Tab to Undo, Enter', async () => {
    await service.createTemplate(daily('Walk'))
    const user = setupUser()
    renderDay()
    await screen.findByText('Walk')
    await user.click(box('Walk'))
    await screen.findByText(doneNotice('Walk'))
    undoButton('Walk').focus()
    expect(document.activeElement).toBe(undoButton('Walk'))
    await user.keyboard('{Enter}')
    await waitFor(() => expect(box('Walk').checked).toBe(false))
    expect((await persisted('Walk')).completion).toBe(0)
  })

  it('a repeating task: Undo changes only that day’s occurrence and the repeating task is untouched', async () => {
    const template = await service.createTemplate(daily('Walk'))
    const user = setupUser()
    renderDay()
    await screen.findByText('Walk')
    await user.click(box('Walk'))
    await screen.findByText(doneNotice('Walk'))
    await user.click(undoButton('Walk'))
    await waitFor(() => expect(box('Walk').checked).toBe(false))
    expect(await service.listTemplates()).toEqual([expect.objectContaining({ id: template.id, recurrence: 'daily', endsOn: null })])
    expect(await countRows(world, userId, 'task-occurrences')).toBe(1)
  })
})

describe('Move and its Undo on My Day, against the real service and database', () => {
  const moveForm = (title) => screen.getByRole('form', { name: `Move ${title}` })
  const movedNotice = (title, when) => `“${title}” moved to ${when}.`

  it('the date field offers only days the planner accepts: 6 days back to 30 days ahead', async () => {
    await service.createTemplate({ title: 'Dentist', recurrence: 'once', startsOn: TODAY })
    const user = setupUser()
    renderDay()
    await screen.findByText('Dentist')
    await user.click(screen.getByRole('button', { name: 'Move Dentist' }))
    const date = within(moveForm('Dentist')).getByLabelText('Move to')
    expect(date.getAttribute('min')).toBe('2026-03-04')
    expect(date.getAttribute('max')).toBe('2026-04-09')
    expect(date.value).toBe('2026-03-11')
  })

  it('moving a one-off task offers Undo, and Undo brings it back to its own day without leaving a copy', async () => {
    await service.createTemplate({ title: 'Dentist', recurrence: 'once', startsOn: TODAY })
    const user = setupUser()
    renderDay()
    await screen.findByText('Dentist')
    await user.click(screen.getByRole('button', { name: 'Move Dentist' }))
    fireEvent.change(within(moveForm('Dentist')).getByLabelText('Move to'), { target: { value: '2026-03-12' } })
    await user.click(within(moveForm('Dentist')).getByRole('button', { name: 'Move task' }))
    expect(await screen.findByText(movedNotice('Dentist', 'Thursday 12 Mar'))).toBeTruthy()
    expect(within(screen.getByLabelText('Set aside tasks')).getByText('Moved to Thursday 12 Mar')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Undo: move of Dentist' }))
    await waitFor(() => expect(screen.queryByText(movedNotice('Dentist', 'Thursday 12 Mar'))).toBeNull())
    expect(await screen.findByRole('checkbox', { name: 'Done: Dentist' })).toBeTruthy() // back in today's list, ready to tick
    expect(screen.queryByLabelText('Set aside tasks')).toBeNull()
    expect(await countRows(world, userId, 'task-occurrences')).toBe(1) // no duplicate
    expect((await persisted('Dentist')).planState).toBe('active')
    expect((await service.getDayPlan('2026-03-12')).occurrences.filter((o) => o.planState === 'active')).toEqual([])
  })

  it('a failed Undo of a move says so and leaves the move as the server has it', async () => {
    await service.createTemplate({ title: 'Dentist', recurrence: 'once', startsOn: TODAY })
    const user = setupUser()
    renderDay()
    await screen.findByText('Dentist')
    await user.click(screen.getByRole('button', { name: 'Move Dentist' }))
    fireEvent.change(within(moveForm('Dentist')).getByLabelText('Move to'), { target: { value: '2026-03-12' } })
    await user.click(within(moveForm('Dentist')).getByRole('button', { name: 'Move task' }))
    await screen.findByText(movedNotice('Dentist', 'Thursday 12 Mar'))
    failNext = (state) => state.table === 'task_occurrences' && state.op === 'select' && state.filters.some((f) => f.column === 'rescheduled_from_id')
    await user.click(screen.getByRole('button', { name: 'Undo: move of Dentist' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText(movedNotice('Dentist', 'Thursday 12 Mar'))).toBeNull()
    expect((await service.getDayPlan(TODAY)).occurrences[0]).toMatchObject({ planState: 'excluded', excludedReason: 'rescheduled' }) // still moved
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('checkbox', { name: 'Done: Dentist' })).toBeTruthy() // back on the day only once the server confirmed it
    expect(screen.queryByRole('alert')).toBeNull()
    expect((await persisted('Dentist')).planState).toBe('active')
  })

  it('a repeating task that is not due on the new day gets a clean Undo; the repeating task is untouched', async () => {
    const template = await service.createTemplate({ title: 'Gym', recurrence: 'weekly', weekdays: [2], startsOn: '2026-03-01' })
    const user = setupUser()
    renderDay()
    await screen.findByText('Gym')
    await user.click(screen.getByRole('button', { name: 'Move Gym' }))
    fireEvent.change(within(moveForm('Gym')).getByLabelText('Move to'), { target: { value: '2026-03-13' } })
    await user.click(within(moveForm('Gym')).getByRole('button', { name: 'Move task' }))
    await screen.findByText(movedNotice('Gym', 'Friday 13 Mar'))
    await user.click(screen.getByRole('button', { name: 'Undo: move of Gym' }))
    await waitFor(() => expect(screen.queryByLabelText('Set aside tasks')).toBeNull())
    expect(await service.listTemplates()).toEqual([expect.objectContaining({ id: template.id, recurrence: 'weekly', weekdays: [2] })])
    expect((await service.getDayPlan('2026-03-13')).occurrences.filter((o) => o.planState === 'active')).toEqual([])
  })

  it('a repeating task that is due on the new day anyway is moved without the quick Undo (the row’s own "Undo move" is still there)', async () => {
    await service.createTemplate(daily('Walk'))
    const user = setupUser()
    renderDay()
    await screen.findByText('Walk')
    await user.click(screen.getByRole('button', { name: 'Move Walk' }))
    fireEvent.change(within(moveForm('Walk')).getByLabelText('Move to'), { target: { value: '2026-03-12' } })
    await user.click(within(moveForm('Walk')).getByRole('button', { name: 'Move task' }))
    expect(await screen.findByText('Moved to Thursday 12 Mar')).toBeTruthy() // the row says where it went
    expect(screen.queryByText(movedNotice('Walk', 'Thursday 12 Mar'))).toBeNull()
    expect(screen.queryByRole('button', { name: 'Undo: move of Walk' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Undo move of Walk' })).toBeTruthy()
  })

  it('a refused move shows the planner’s message, offers no Undo, and moves nothing', async () => {
    await service.createTemplate({ title: 'Dentist', recurrence: 'once', startsOn: TODAY })
    const user = setupUser()
    renderDay()
    await screen.findByText('Dentist')
    await user.click(screen.getByRole('button', { name: 'Move Dentist' }))
    fireEvent.change(within(moveForm('Dentist')).getByLabelText('Move to'), { target: { value: '2026-05-01' } }) // past the limit (a typed date can still be out of range)
    await user.click(within(moveForm('Dentist')).getByRole('button', { name: 'Move task' }))
    expect(await within(moveForm('Dentist')).findByText(/ahead|far|plan/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Undo:/ })).toBeNull()
    expect((await persisted('Dentist')).planState).toBe('active')
  })
})

// The daily schedule and the focus timer on the real page. Focus needs a signed-in person, so these render inside an auth context.
const renderSignedIn = (path = '/app/day') =>
  render(h(AuthContext.Provider, { value: { status: 'authenticated', session: null, user: { id: `focus-user-${userId}`, email: 'me@example.com' }, signOut: vi.fn() } }, h(ThemeProvider, { theme }, h(MemoryRouter, { initialEntries: [path] }, h(MyDayPage)))))
const occurrence = async (title) => (await service.getDayPlan(TODAY)).occurrences.find((o) => o.title === title)

describe('The daily schedule', () => {
  it('shows tasks with a time in time order, apart from the ones with no time', async () => {
    await service.createTask(TODAY, { title: 'Read' })
    await service.createTask(TODAY, { title: 'Gym', plannedStart: '17:00', plannedEnd: '18:00' })
    await service.createTask(TODAY, { title: 'Report', plannedStart: '09:00', plannedEnd: '11:00', isPriority: true })
    await service.createTask(TODAY, { title: 'Call mum' })
    renderDay()
    const scheduled = await screen.findByRole('list', { name: 'Scheduled tasks' })
    expect(within(scheduled).getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual(['Done: Report', 'Done: Gym'])
    expect(within(scheduled).getByText(/09:00 to 11:00/)).toBeInTheDocument()
    expect(within(scheduled).getByText(/Report \(priority\)/)).toBeInTheDocument()
    const anytime = screen.getByRole('list', { name: 'Unscheduled tasks' })
    expect(within(anytime).getAllByRole('checkbox').map((c) => c.getAttribute('aria-label')).sort()).toEqual(['Done: Call mum', 'Done: Read'])
  })

  it('is the plain list when no task has a time', async () => {
    await service.createTask(TODAY, { title: 'Read' })
    renderDay()
    expect(await screen.findByRole('list', { name: 'Today’s tasks' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Scheduled' })).toBeNull()
  })

  it('giving a task a time with Edit moves it into the schedule and changes nothing else about it', async () => {
    const user = setupUser()
    await service.createTask(TODAY, { title: 'Gym', plannedStart: '17:00' })
    await service.createTask(TODAY, { title: 'Read', isPriority: true, estimatedMinutes: 30, category: 'Study' })
    const before = await occurrence('Read')
    await service.setCompletion(before.id, 0.5)
    renderDay()
    await user.click(await screen.findByRole('button', { name: 'Edit Read' }))
    const form = screen.getByRole('form', { name: 'Edit Read' })
    await user.type(within(form).getByLabelText(/Start time/), '14:00')
    await user.click(within(form).getByRole('button', { name: 'Save changes' }))
    const scheduled = await screen.findByRole('list', { name: 'Scheduled tasks' })
    await waitFor(() => expect(within(scheduled).getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual(['Done: Read', 'Done: Gym']))
    expect(screen.queryByRole('list', { name: 'Unscheduled tasks' })).toBeNull()
    const after = await occurrence('Read')
    expect(after).toMatchObject({ id: before.id, planDate: TODAY, completion: 0.5, isPriority: true, estimatedMinutes: 30, category: 'Study', plannedStart: '14:00', planState: 'active' })
  })

  it('taking a time away with Edit moves the task back to the tasks with no time, with its id and progress kept', async () => {
    const user = setupUser()
    await service.createTask(TODAY, { title: 'Report', plannedStart: '09:00', plannedEnd: '10:00' })
    await service.createTask(TODAY, { title: 'Gym', plannedStart: '17:00' })
    const before = await occurrence('Report')
    await service.setCompletion(before.id, 1)
    renderDay()
    await user.click(await screen.findByRole('button', { name: 'Edit Report' }))
    const form = screen.getByRole('form', { name: 'Edit Report' })
    await user.clear(within(form).getByLabelText(/Start time/))
    await user.clear(within(form).getByLabelText(/End time/))
    await user.click(within(form).getByRole('button', { name: 'Save changes' }))
    const anytime = await screen.findByRole('list', { name: 'Unscheduled tasks' })
    expect(within(anytime).getByRole('checkbox', { name: 'Done: Report' })).toBeChecked()
    const after = await occurrence('Report')
    expect(after).toMatchObject({ id: before.id, completion: 1, plannedStart: null, plannedEnd: null })
  })
})

describe('The focus timer on My Day', () => {
  it('has a Focus button on an open task only', async () => {
    await service.createTask(TODAY, { title: 'Read' })
    await service.createTask(TODAY, { title: 'Finished' })
    await service.setCompletion((await occurrence('Finished')).id, 1)
    renderSignedIn()
    expect(await screen.findByRole('button', { name: 'Focus on Read' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Focus on Finished' })).toBeNull()
  })

  it('is not offered without a signed-in person', async () => {
    await service.createTask(TODAY, { title: 'Read' })
    renderDay()
    await findBox('Read')
    expect(screen.queryByRole('button', { name: /Focus on/ })).toBeNull()
  })

  it('choose a task and a length, start, pause, resume and end: the task itself is never changed', async () => {
    const user = setupUser()
    await service.createTask(TODAY, { title: 'Read', isPriority: true })
    const before = await occurrence('Read')
    renderSignedIn()
    await user.click(await screen.findByRole('button', { name: 'Focus on Read' }))
    expect(screen.getByRole('heading', { name: 'Focus on “Read”' })).toHaveFocus() // the button that was used is gone: focus follows to the panel
    await user.click(screen.getByRole('button', { name: '15 minutes' }))
    await user.click(screen.getByRole('button', { name: 'Start focus' }))
    expect(await screen.findByRole('heading', { name: 'Focusing on “Read”' })).toHaveFocus()
    expect(screen.getByRole('timer', { name: 'Time left' })).toHaveTextContent(/^1[45]:\d\d$/)
    expect(screen.getByText('Focusing')).toBeInTheDocument() // marked on the task's own row
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    expect(screen.getByText('Paused. This time is not counted.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Resume' }))
    expect(screen.getByText(/^Running\./)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'End session' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'End session' }))
    expect(await screen.findByRole('heading', { name: 'Session ended early' })).toHaveFocus()
    expect(box('Read')).not.toBeChecked() // the timer did not complete the task
    expect(await occurrence('Read')).toMatchObject({ id: before.id, completion: 0, planState: 'active', isPriority: true })
  })

  it('a session survives a page reload: the same session, the same task, time still running', async () => {
    const user = setupUser()
    await service.createTask(TODAY, { title: 'Read' })
    const first = renderSignedIn()
    await user.click(await screen.findByRole('button', { name: 'Focus on Read' }))
    await user.click(screen.getByRole('button', { name: '45 minutes' }))
    await user.click(screen.getByRole('button', { name: 'Start focus' }))
    await screen.findByRole('heading', { name: 'Focusing on “Read”' })
    first.unmount() // a reload
    renderSignedIn()
    expect(await screen.findByRole('heading', { name: 'Focusing on “Read”' })).toBeInTheDocument()
    expect(document.body).toHaveFocus() // a page that opens on a running session does not grab focus
    expect(screen.getByRole('timer', { name: 'Time left' })).toHaveTextContent(/^4[45]:\d\d$/)
    expect(screen.getByText('Running. 45 minutes session.')).toBeInTheDocument()
  })

  it('a paused session is still paused after a reload', async () => {
    const user = setupUser()
    await service.createTask(TODAY, { title: 'Read' })
    const first = renderSignedIn()
    await user.click(await screen.findByRole('button', { name: 'Focus on Read' }))
    await user.click(screen.getByRole('button', { name: 'Start focus' }))
    await user.click(await screen.findByRole('button', { name: 'Pause' }))
    first.unmount()
    renderSignedIn()
    expect(await screen.findByRole('button', { name: 'Resume' })).toBeInTheDocument()
    expect(screen.getByText('Paused. This time is not counted.')).toBeInTheDocument()
  })

  it('the summary offers “Mark it done”, which completes the task only when chosen, through the normal path', async () => {
    const user = setupUser()
    await service.createTask(TODAY, { title: 'Read' })
    renderSignedIn()
    await user.click(await screen.findByRole('button', { name: 'Focus on Read' }))
    await user.click(screen.getByRole('button', { name: 'Start focus' }))
    await user.click(await screen.findByRole('button', { name: 'End session' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'End session' }))
    await screen.findByRole('heading', { name: 'Session ended early' })
    expect((await occurrence('Read')).completion).toBe(0)
    await user.click(screen.getByRole('button', { name: 'Mark it done' }))
    await waitFor(() => expect(box('Read')).toBeChecked())
    expect((await occurrence('Read')).completion).toBe(1)
    expect(screen.queryByRole('heading', { name: 'Session ended early' })).toBeNull()
  })

  it('the day shows the time focused, and the task shows its own share', async () => {
    await service.createTask(TODAY, { title: 'Read' })
    const task = await occurrence('Read')
    localStorage.setItem(`arcloop.focus.log.focus-user-${userId}`, JSON.stringify([
      { id: 'a', taskId: task.id, planDate: TODAY, title: 'Read', plannedMs: 1500000, focusedMs: 1500000, outcome: 'completed', startedAt: 1, endedAt: 2 },
      { id: 'b', taskId: task.id, planDate: TODAY, title: 'Read', plannedMs: 900000, focusedMs: 600000, outcome: 'ended_early', startedAt: 3, endedAt: 4 },
    ]))
    renderSignedIn()
    expect(await screen.findByLabelText('Focus time on this day')).toHaveTextContent('35 minutes in 2 sessions')
    expect(screen.getByText(/35 min focused/)).toBeInTheDocument()
  })
})

describe('Planning help: quick times and the schedule check', () => {
  const idOf = async (title) => (await occurrence(title)).id

  it('giving a task a time moves it into the schedule and changes nothing else about it', async () => {
    const user = setupUser()
    await service.createTask(TODAY, { title: 'Gym', plannedStart: '17:00' })
    await service.createTask(TODAY, { title: 'Read', isPriority: true, estimatedMinutes: 30, category: 'Study', description: 'Chapter 3' })
    const before = await occurrence('Read')
    await service.setCompletion(before.id, 0.5)
    renderDay()
    await user.click(await screen.findByRole('button', { name: 'Set a time for Read' }))
    await user.type(screen.getByLabelText('Start time'), '14:00')
    await user.click(screen.getByRole('button', { name: 'Save time' }))
    const scheduled = await screen.findByRole('list', { name: 'Scheduled tasks' })
    await waitFor(() => expect(within(scheduled).getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual(['Done: Read', 'Done: Gym']))
    expect(await screen.findByText('“Read” is now at 14:00.')).toBeInTheDocument()
    expect(await occurrence('Read')).toMatchObject({ id: before.id, planDate: TODAY, completion: 0.5, isPriority: true, estimatedMinutes: 30, category: 'Study', description: 'Chapter 3', plannedStart: '14:00', plannedEnd: null, planState: 'active' })
  })

  it('the 15 minute buttons move the whole block, saving each time, and the task stays where it is in the list', async () => {
    const user = setupUser()
    await service.createTask(TODAY, { title: 'Gym', plannedStart: '17:00', plannedEnd: '18:00' })
    renderDay()
    await user.click(await screen.findByRole('button', { name: 'Change the time of Gym' }))
    await user.click(screen.getByRole('button', { name: 'Move Gym 15 minutes later' }))
    await waitFor(async () => expect(await occurrence('Gym')).toMatchObject({ plannedStart: '17:15', plannedEnd: '18:15' }))
    await user.click(await screen.findByRole('button', { name: 'Move Gym 15 minutes earlier' }))
    await user.click(await screen.findByRole('button', { name: 'Move Gym 15 minutes earlier' }))
    await waitFor(async () => expect(await occurrence('Gym')).toMatchObject({ plannedStart: '16:45', plannedEnd: '17:45' }))
    expect(await screen.findByText('“Gym” is now at 16:45 to 17:45.')).toBeInTheDocument()
  })

  it('removing the time moves the task back to the ones with no time, with its id and progress kept', async () => {
    const user = setupUser()
    await service.createTask(TODAY, { title: 'Report', plannedStart: '09:00', plannedEnd: '10:00', isPriority: true })
    await service.createTask(TODAY, { title: 'Gym', plannedStart: '17:00' })
    const before = await occurrence('Report')
    await service.setCompletion(before.id, 0.5)
    renderDay()
    await user.click(await screen.findByRole('button', { name: 'Change the time of Report' }))
    await user.click(screen.getByRole('button', { name: 'Remove the time' }))
    const anytime = await screen.findByRole('list', { name: 'Unscheduled tasks' })
    expect(within(anytime).getByRole('checkbox', { name: 'Done: Report' })).toBeInTheDocument()
    expect(await screen.findByText('“Report” no longer has a time.')).toBeInTheDocument()
    expect(await occurrence('Report')).toMatchObject({ id: before.id, completion: 0.5, isPriority: true, plannedStart: null, plannedEnd: null })
  })

  it('shows the planner’s own message when the times are not allowed, and saves nothing', async () => {
    const user = setupUser()
    await service.createTask(TODAY, { title: 'Read' })
    renderDay()
    await user.click(await screen.findByRole('button', { name: 'Set a time for Read' }))
    await user.type(screen.getByLabelText('Start time'), '10:00')
    await user.type(screen.getByLabelText('End time (optional)'), '09:00')
    await user.click(screen.getByRole('button', { name: 'Save time' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The end time needs to be after the start time.')
    expect(await occurrence('Read')).toMatchObject({ plannedStart: null, plannedEnd: null })
  })

  it('points out two tasks that overlap, without changing either, and the note goes when one is moved clear', async () => {
    const user = setupUser()
    await service.createTask(TODAY, { title: 'Dentist', plannedStart: '09:00', plannedEnd: '09:45' })
    await service.createTask(TODAY, { title: 'Call mum', plannedStart: '09:30', plannedEnd: '10:00' })
    renderDay()
    const note = await screen.findByRole('region', { name: 'Schedule check' })
    expect(note).toHaveTextContent('“Dentist” (09:00 to 09:45) overlaps “Call mum” (09:30 to 10:00).')
    expect(await occurrence('Dentist')).toMatchObject({ plannedStart: '09:00', plannedEnd: '09:45' }) // nothing changed by showing it
    await user.click(screen.getByRole('button', { name: 'Change the time of Call mum' }))
    await user.click(screen.getByRole('button', { name: 'Move Call mum 15 minutes later' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Schedule check' })).toBeNull()) // 09:45 to 10:15 only touches the dentist's end
    expect(await occurrence('Call mum')).toMatchObject({ plannedStart: '09:45', plannedEnd: '10:15' })
  })

  it('“Not now” hides the note for the day and it stays hidden when the day is opened again', async () => {
    const user = setupUser()
    await service.createTask(TODAY, { title: 'Dentist', plannedStart: '09:00', plannedEnd: '09:45' })
    await service.createTask(TODAY, { title: 'Call mum', plannedStart: '09:30', plannedEnd: '10:00' })
    const first = renderDay()
    await screen.findByRole('region', { name: 'Schedule check' })
    await user.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('region', { name: 'Schedule check' })).toBeNull()
    first.unmount()
    renderDay()
    await screen.findByRole('list', { name: 'Scheduled tasks' })
    expect(screen.queryByRole('region', { name: 'Schedule check' })).toBeNull()
  })

  it('points out a day that holds more than a day can, and offers nothing automatic', async () => {
    for (const title of ['Project A', 'Project B', 'Project C']) await service.createTask(TODAY, { title, estimatedMinutes: 360 }) // 18 hours in all
    renderDay()
    const note = await screen.findByRole('region', { name: 'Schedule check' })
    expect(note).toHaveTextContent('About 18 h of tasks')
    expect(note).toHaveTextContent('Moving')
    expect(await occurrence('Project A')).toMatchObject({ estimatedMinutes: 360, planState: 'active' }) // nothing was moved or removed
  })

  it('says nothing about a day that fits', async () => {
    await service.createTask(TODAY, { title: 'Dentist', plannedStart: '09:00', plannedEnd: '09:45' })
    await service.createTask(TODAY, { title: 'Call mum', plannedStart: '10:00', plannedEnd: '10:30' })
    renderDay()
    await screen.findByRole('list', { name: 'Scheduled tasks' })
    expect(screen.queryByRole('region', { name: 'Schedule check' })).toBeNull()
    expect(await idOf('Dentist')).toBeTruthy()
  })
})

describe('Wrap up the day', () => {
  const TOMORROW = '2026-03-11'
  const onDay = async (date, title) => (await service.getDayPlan(date)).occurrences.find((o) => o.title === title)
  const openWrapUp = async (user) => {
    await user.click(await screen.findByRole('button', { name: 'Look back on the day' }))
    await waitFor(() => expect(screen.queryByText(/One moment/)).toBeNull()) // the panel first asks which of the tasks really repeat
  }
  async function seedDay() {
    await service.createTask(TODAY, { title: 'Read' })
    await service.createTask(TODAY, { title: 'Walk', isPriority: true, estimatedMinutes: 20, category: 'Health' })
    await service.createTask(TODAY, { title: 'Call mum' })
    await service.setCompletion((await occurrence('Read')).id, 1)
    await service.setCompletion((await occurrence('Walk')).id, 0.5)
  }

  it('looks back on the day: what was done, what is partly done, what is open, and what repeats anyway', async () => {
    const user = setupUser()
    await seedDay()
    await service.createTemplate(daily('Stretch'))
    renderDay()
    await openWrapUp(user)
    const done = screen.getByRole('region', { name: 'Done today' })
    expect(within(done).getByText('Read')).toBeInTheDocument()
    expect(within(done).getByText('1 more is partly done. Partly done counts.')).toBeInTheDocument()
    const group = screen.getByRole('group', { name: /^Carry to Wednesday 11 Mar/ })
    expect(within(group).getByRole('checkbox', { name: 'Walk (partly done)' })).toBeChecked()
    expect(within(group).getByRole('checkbox', { name: 'Call mum' })).toBeChecked()
    expect(screen.getByText(/These repeat anyway, so they will be on their own days: Stretch\./)).toBeInTheDocument()
  })

  it('carries the ticked tasks to tomorrow through the planner’s own move, and touches nothing else', async () => {
    const user = setupUser()
    await seedDay()
    await service.createTemplate(daily('Stretch'))
    renderDay()
    await openWrapUp(user)
    await user.click(screen.getByRole('button', { name: 'Carry 2 to Wednesday 11 Mar' }))
    expect(await screen.findByText('2 tasks moved to Wednesday 11 Mar. Each one can be undone under “Set aside or moved”.')).toBeInTheDocument()
    expect(await onDay(TOMORROW, 'Walk')).toMatchObject({ planState: 'active', isPriority: true, estimatedMinutes: 20, category: 'Health' })
    expect(await onDay(TOMORROW, 'Call mum')).toMatchObject({ planState: 'active' })
    expect(await occurrence('Walk')).toMatchObject({ planState: 'excluded', excludedReason: 'rescheduled' })
    expect(await occurrence('Call mum')).toMatchObject({ planState: 'excluded', excludedReason: 'rescheduled' })
    expect(await occurrence('Read')).toMatchObject({ planState: 'active', completion: 1 }) // done tasks stay as they were
    expect(await occurrence('Stretch')).toMatchObject({ planState: 'active' }) // the repeating task was not part of it
    expect(screen.getByRole('list', { name: 'Set aside tasks' })).toBeInTheDocument()
  })

  it('carries only what was left ticked', async () => {
    const user = setupUser()
    await seedDay()
    renderDay()
    await openWrapUp(user)
    await user.click(screen.getByRole('checkbox', { name: 'Call mum' }))
    await user.click(screen.getByRole('button', { name: 'Carry 1 to Wednesday 11 Mar' }))
    expect(await screen.findByText(/^1 task moved to Wednesday 11 Mar\./)).toBeInTheDocument()
    expect(await onDay(TOMORROW, 'Walk')).toBeTruthy()
    expect(await onDay(TOMORROW, 'Call mum')).toBeUndefined()
    expect(await occurrence('Call mum')).toMatchObject({ planState: 'active' })
  })

  it('a move can still be undone on the moved task', async () => {
    const user = setupUser()
    await seedDay()
    renderDay()
    await openWrapUp(user)
    await user.click(screen.getByRole('button', { name: 'Carry 2 to Wednesday 11 Mar' }))
    await screen.findByText(/moved to Wednesday 11 Mar/)
    await user.click(await screen.findByRole('button', { name: 'Undo move of Call mum' }))
    await waitFor(async () => expect(await occurrence('Call mum')).toMatchObject({ planState: 'active' }))
    expect(await onDay(TOMORROW, 'Call mum')).toBeUndefined()
  })

  it('if one move fails, the ones already moved stay moved, the rest stay put, and it says so', async () => {
    const user = setupUser()
    await seedDay()
    renderDay()
    await openWrapUp(user)
    let inserts = 0
    failNext = (state) => state.table === 'task_occurrences' && state.op === 'insert' && (inserts += 1) === 2 // the second move's copy cannot be made
    await user.click(screen.getByRole('button', { name: 'Carry 2 to Wednesday 11 Mar' }))
    expect(await screen.findByText(/^1 task moved to Wednesday 11 Mar before something went wrong:/)).toBeInTheDocument()
    expect(await onDay(TOMORROW, 'Walk')).toBeTruthy()
    expect(await occurrence('Call mum')).toMatchObject({ planState: 'active' }) // still on today
    expect(await onDay(TOMORROW, 'Call mum')).toBeUndefined()
  })

  it('is offered on today only, not on an earlier or a later day', async () => {
    await seedDay()
    renderDay('/app/day?date=2026-03-09')
    await screen.findByRole('heading', { name: /Monday, / })
    expect(screen.queryByRole('region', { name: 'Wrap up the day' })).toBeNull()
  })

  it('shows the focus time recorded in this browser for the day', async () => {
    const user = setupUser()
    await seedDay()
    const task = await occurrence('Read')
    localStorage.setItem(`arcloop.focus.log.focus-user-${userId}`, JSON.stringify([
      { id: 'a', taskId: task.id, planDate: TODAY, title: 'Read', plannedMs: 1500000, focusedMs: 1500000, outcome: 'completed', startedAt: 1, endedAt: 2 },
      { id: 'b', taskId: task.id, planDate: TODAY, title: 'Read', plannedMs: 900000, focusedMs: 600000, outcome: 'ended_early', startedAt: 3, endedAt: 4 },
    ]))
    renderSignedIn()
    await openWrapUp(user)
    expect(screen.getByRole('region', { name: 'Focus time today' })).toHaveTextContent('35 min in 2 sessions (kept in this browser).')
  })
})

describe('A break after a long focus session', () => {
  it('suggests one, gently, in the summary of a session that ran long, and does not touch the task', async () => {
    const user = setupUser()
    await service.createTask(TODAY, { title: 'Read' })
    const read = await occurrence('Read')
    const startedAt = Date.now() - 50 * 60 * 1000 // a 60 minute session that has been running for 50
    localStorage.setItem(`arcloop.focus.active.focus-user-${userId}`, JSON.stringify({
      v: 1, id: 'long-one', taskId: read.id, planDate: TODAY, title: 'Read', plannedMs: 60 * 60 * 1000, status: 'running',
      startedAt, segmentStartedAt: startedAt, accumulatedMs: 0, pausedAt: null, gapFrom: null,
    }))
    renderSignedIn()
    await user.click(await screen.findByRole('button', { name: 'End session' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'End session' }))
    const summary = await screen.findByRole('heading', { name: 'Session ended early' })
    expect(summary.closest('section')).toHaveTextContent('A break of about 5 minutes away from the screen would help, if you like.')
    expect((await occurrence('Read')).completion).toBe(0)
  })

  it('suggests nothing after a short session', async () => {
    const user = setupUser()
    await service.createTask(TODAY, { title: 'Read' })
    const read = await occurrence('Read')
    const startedAt = Date.now() - 10 * 60 * 1000
    localStorage.setItem(`arcloop.focus.active.focus-user-${userId}`, JSON.stringify({
      v: 1, id: 'short-one', taskId: read.id, planDate: TODAY, title: 'Read', plannedMs: 25 * 60 * 1000, status: 'running',
      startedAt, segmentStartedAt: startedAt, accumulatedMs: 0, pausedAt: null, gapFrom: null,
    }))
    renderSignedIn()
    await user.click(await screen.findByRole('button', { name: 'End session' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'End session' }))
    const summary = await screen.findByRole('heading', { name: 'Session ended early' })
    expect(summary.closest('section')).not.toHaveTextContent(/break/)
  })
})

describe('Priority levels and the time for the day', () => {
  const TOMORROW = '2026-03-11'
  const onDay = async (date, title) => (await service.getDayPlan(date)).occurrences.find((o) => o.title === title)
  const capacity = () => screen.findByRole('region', { name: 'Day capacity' })
  // 8 hours planned: one high, one low and one medium task.
  async function overloadedDay() {
    await service.createTask(TODAY, { title: 'Report', priorityLevel: 'high', estimatedMinutes: 240 })
    await service.createTask(TODAY, { title: 'Tidy desk', priorityLevel: 'low', estimatedMinutes: 120 })
    await service.createTask(TODAY, { title: 'Emails', priorityLevel: 'medium', estimatedMinutes: 120 })
  }

  it('a task has three levels, and the one chosen in Edit is saved with the old flag in step', async () => {
    const user = setupUser()
    await service.createTask(TODAY, { title: 'Walk' })
    expect(await occurrence('Walk')).toMatchObject({ priorityLevel: 'medium', isPriority: false })
    renderDay()
    await screen.findByText('Walk')
    await user.click(screen.getByRole('button', { name: 'Edit Walk' }))
    const form = screen.getByRole('form', { name: 'Edit Walk' })
    expect([...within(form).getByLabelText('Priority').options].map((o) => o.textContent)).toEqual(['High', 'Medium', 'Low'])
    await user.selectOptions(within(form).getByLabelText('Priority'), 'low')
    await user.click(within(form).getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Low priority')).toBeInTheDocument()
    expect(await occurrence('Walk')).toMatchObject({ priorityLevel: 'low', isPriority: false })
    await user.click(screen.getByRole('button', { name: 'Edit Walk' }))
    await user.selectOptions(within(screen.getByRole('form', { name: 'Edit Walk' })).getByLabelText('Priority'), 'high')
    await user.click(within(screen.getByRole('form', { name: 'Edit Walk' })).getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText(/Walk \(priority\)/)).toBeInTheDocument()
    expect(await occurrence('Walk')).toMatchObject({ priorityLevel: 'high', isPriority: true })
  })

  it('a repeating task has its level on the tasks it makes, and the old flag still means high', async () => {
    await service.createTemplate(daily('Stretch', { priorityLevel: 'low' }))
    await service.createTemplate(daily('Plan', { isPriority: true }))
    renderDay()
    await screen.findByText('Stretch')
    expect(await occurrence('Stretch')).toMatchObject({ priorityLevel: 'low', isPriority: false })
    expect(await occurrence('Plan')).toMatchObject({ priorityLevel: 'high', isPriority: true })
  })

  it('refuses an unknown level with the planner message and saves nothing', async () => {
    await expect(service.createTask(TODAY, { title: 'Odd', priorityLevel: 'urgent' })).rejects.toMatchObject({ code: 'VALIDATION', details: { fields: { priorityLevel: 'Choose High, Medium or Low.' } } })
    expect(await countRows(world, userId, 'task-occurrences')).toBe(0)
  })

  it('shows planned time against the time available, and says nothing about moving anything while the day fits', async () => {
    await service.createTask(TODAY, { title: 'Report', estimatedMinutes: 120 })
    renderDay()
    const note = await capacity()
    expect(note).toHaveTextContent('2 h planned of 6 h available.')
    expect(screen.queryByText(/If you like, you could move/)).toBeNull()
  })

  it('on a day that holds more than the time available, gently suggests the lowest priority task, and moves nothing by itself', async () => {
    await overloadedDay()
    renderDay()
    const note = await capacity()
    expect(note).toHaveTextContent('8 h planned of 6 h available: 2 h more than the time you have.')
    expect(await within(note).findByText(/If you like, you could move “Tidy desk” to Wednesday 11 Mar/)).toBeInTheDocument()
    expect(within(note).queryByText(/“Report”/)).toBeNull() // high priority is never suggested
    expect(await occurrence('Tidy desk')).toMatchObject({ planState: 'active' })
    expect(await onDay(TOMORROW, 'Tidy desk')).toBeUndefined()
  })

  it('moves the suggested task to the next day with its details kept, and the move can be undone', async () => {
    const user = setupUser()
    await overloadedDay()
    renderDay()
    await user.click(await screen.findByRole('button', { name: 'Move 1 to Wednesday 11 Mar' }))
    expect(await screen.findByText('1 task moved to Wednesday 11 Mar. Each one can be undone under “Set aside or moved”.')).toBeInTheDocument()
    expect(await onDay(TOMORROW, 'Tidy desk')).toMatchObject({ planState: 'active', priorityLevel: 'low', estimatedMinutes: 120 })
    expect(await occurrence('Tidy desk')).toMatchObject({ planState: 'excluded', excludedReason: 'rescheduled' })
    expect(await occurrence('Report')).toMatchObject({ planState: 'active', priorityLevel: 'high' })
    expect(await occurrence('Emails')).toMatchObject({ planState: 'active' })
    expect(await capacity()).toHaveTextContent('6 h planned of 6 h available: nearly full.')
    await user.click(await screen.findByRole('button', { name: 'Undo move of Tidy desk' }))
    await waitFor(async () => expect(await occurrence('Tidy desk')).toMatchObject({ planState: 'active' }))
    expect(await onDay(TOMORROW, 'Tidy desk')).toBeUndefined()
  })

  it('never suggests a repeating task, however low its priority', async () => {
    await service.createTemplate(daily('Stretch', { priorityLevel: 'low', estimatedMinutes: 420 }))
    await service.createTask(TODAY, { title: 'One-off', priorityLevel: 'low', estimatedMinutes: 60 })
    renderDay()
    const note = await capacity()
    expect(await within(note).findByText(/If you like, you could move “One-off” to/)).toBeInTheDocument()
    expect(within(note).queryByText(/“Stretch”/)).toBeNull()
  })

  it('"Not now" hides the suggestion for the day and keeps the figures', async () => {
    const user = setupUser()
    await overloadedDay()
    renderDay()
    await user.click(await screen.findByRole('button', { name: 'Not now' }))
    expect(screen.queryByText(/If you like, you could move/)).toBeNull()
    expect(await capacity()).toHaveTextContent('2 h more than the time you have')
  })

  it('the time available is chosen by the person: changing it changes the finding and is remembered', async () => {
    const user = setupUser()
    await overloadedDay()
    const view = renderDay()
    await user.selectOptions(await screen.findByLabelText('Time you have for tasks'), '600')
    expect(await capacity()).toHaveTextContent('8 h planned of 10 h available.')
    expect(screen.queryByText(/If you like, you could move/)).toBeNull()
    view.unmount()
    renderDay()
    expect(await capacity()).toHaveTextContent('8 h planned of 10 h available.')
  })

  it('a task without a time or an estimate is not counted, and the note says so', async () => {
    await service.createTask(TODAY, { title: 'Think', estimatedMinutes: null })
    await service.createTask(TODAY, { title: 'Report', estimatedMinutes: 60 })
    renderDay()
    expect(await capacity()).toHaveTextContent('1 task has no time or estimate, so not counted')
  })
})
