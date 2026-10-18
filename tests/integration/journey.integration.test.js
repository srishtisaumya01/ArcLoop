import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import { setupUser } from './user.js'
import { renderAt } from '../unit/renderRoute.jsx'
import { WEEK_NOTE, WELCOME_BACK } from '../../src/constants/recoveryCopy.js'
import { createTestClient, createUser, createWorld, listRows, setClock } from './harness.js'

// THE CORE JOURNEY, end to end through the real app routes: sign in, plan a day, edit, complete and
// partly complete, move and set aside, review the Week and Progress, manage a recurring task, then
// come back two days later after a planned day that was never touched.
//
// What is real: the router and every page, the planner/profile/reminder services, and the real
// real Django API and SQLite database (rules, constraints, ownership checks).
// What is NOT real: the auth endpoints (the sign-in screens), (sign-in is simulated through the
// same mocked auth boundary the other UI tests use), the browser, and the network.
const holder = vi.hoisted(() => ({ client: null, session: null, authCallback: null }))
// The one place the app picks its data client (see src/services/backend.js): here it is the Django client of this test.
vi.mock('../../src/services/backend.js', () => ({
  backend: 'django',
  isDjango: true,
  isBackendConfigured: true,
  dataClient: new Proxy({}, { get: (_, key) => holder.client[key] }),
}))
vi.mock('../../src/services/authService.js', () => ({
  getSession: () => Promise.resolve(holder.session),
  signIn: vi.fn().mockResolvedValue(undefined),
  signUp: vi.fn(),
  signOut: vi.fn(),
  requestPasswordReset: vi.fn(),
  updatePassword: vi.fn(),
  onAuthStateChange: (callback) => {
    holder.authCallback = callback
    return () => {}
  },
}))

const TUESDAY = '2026-03-10T15:00:00Z' // 11:00 in New York (EDT)
const THURSDAY = '2026-03-12T13:00:00Z' // 09:00 in New York

let world
let userId
let seq = 0
beforeAll(() => {
  world = createWorld(TUESDAY)
})
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] }) // the app's own "now"; timers stay real so the UI can settle
  vi.setSystemTime(new Date(TUESDAY))
  await setClock(world, TUESDAY)
  userId = await createUser(world, `journey-${(seq += 1)}@example.com`, 'America/New_York')
  holder.client = createTestClient(world, { getUserId: () => userId })
  holder.session = null
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  localStorage.clear()
})

const rows = async (date) =>
  (await listRows(world, userId, 'task-occurrences', { plan_date: date, order: 'title' })).map((r) => ({ title: r.title, completion: Number(r.completion), plan_state: r.plan_state, excluded_reason: r.excluded_reason, moved: r.rescheduled_from_id !== null }))
const nav = (name) => within(screen.getByRole('navigation', { name: 'App' })).getByRole('link', { name })
const progressText = (text) => within(screen.getByLabelText('Day progress', { selector: 'section' })).getByText(text)
const noRegion = (name) => screen.queryByRole('region', { name })

describe('the core journey', () => {
  it('works from sign-in to coming back after a missed day, with history intact', async () => {
    const user = setupUser()
    const session = { user: { id: userId, email: 'asha@example.com' } }

    // 1. Signed out, the app asks for sign-in; signing in lands on the dashboard.
    const first = renderAt('/app')
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome back' })).toBeTruthy()
    await user.type(screen.getByLabelText('Email'), 'asha@example.com')
    await user.type(screen.getByLabelText('Password'), 'a-long-enough-password')
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    holder.session = session
    await act(async () => holder.authCallback('SIGNED_IN', session))
    expect(await screen.findByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening)/ })).toBeTruthy()

    // 2. Create and edit a plan in My Day.
    await user.click(nav('My Day'))
    expect(await screen.findByText('No tasks on this day')).toBeTruthy()
    expect(noRegion('Welcome back')).toBeNull() // nothing was ever planned, so nothing was missed
    const add = async (title) => {
      await user.type(screen.getByRole('textbox', { name: 'Task' }), title)
      await user.click(screen.getByRole('button', { name: 'Add task' }))
      expect(await screen.findByText(title)).toBeTruthy()
    }
    // Repeating tasks are made on the Recurring tasks page (My Day's quick add is for one-off tasks).
    const addRepeating = async (title) => {
      await user.click(nav('Recurring Tasks'))
      const form = await screen.findByRole('form', { name: 'New recurring task' })
      await user.type(within(form).getByRole('textbox', { name: /^Task/ }), title)
      await user.click(within(form).getByRole('button', { name: 'Add recurring task' })) // repeats every day by default
      expect(await screen.findByRole('button', { name: `Edit ${title}` })).toBeTruthy()
      await user.click(nav('My Day'))
      expect(await screen.findByText(title)).toBeTruthy() // it comes back on My Day
    }
    await add('Write report')
    await addRepeating('Stretch')
    await add('Email Sam')
    await add('Tidy desk')
    await user.click(screen.getByRole('button', { name: 'Edit Write report' }))
    const editForm = screen.getByRole('form', { name: 'Edit Write report' })
    const title = within(editForm).getByRole('textbox', { name: /^Task/ })
    await user.clear(title)
    await user.type(title, 'Write the report')
    await user.type(within(editForm).getByLabelText(/Estimate in minutes/), '45')
    await user.click(within(editForm).getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Write the report')).toBeTruthy()

    // 4 (before 3, so the progress figure is easy to read). Move one task and set one aside.
    await user.click(screen.getByRole('button', { name: 'Move Email Sam' }))
    await user.click(screen.getByRole('button', { name: 'Move task' }))
    const aside = await screen.findByLabelText('Set aside tasks')
    expect(within(aside).getByText('Moved to Wednesday 11 Mar')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Set aside Tidy desk' }))
    await waitFor(() => expect(within(screen.getByLabelText('Set aside tasks')).getByText('Set aside for a busy day')).toBeTruthy())

    // 3. Complete one task and partly complete another. Moved and set-aside tasks are not counted.
    await user.click(screen.getByRole('checkbox', { name: 'Done: Stretch' }))
    await user.click(screen.getByRole('button', { name: 'Edit Write the report' })) // Partly is chosen in Edit
    const progressForm = screen.getByRole('form', { name: 'Edit Write the report' })
    await user.click(within(progressForm).getByRole('button', { name: 'Partly' }))
    await user.click(within(progressForm).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(progressText('75% of today’s plan')).toBeTruthy())
    expect(screen.getByText(/1 of 2 done, 1 partly done/)).toBeTruthy()

    // 5. The Week agrees with My Day, and Progress agrees with the Week.
    await user.click(nav('Week'))
    const summary = await screen.findByLabelText('Week summary')
    expect(within(summary).getByText('Tasks completed').nextSibling.textContent).toBe('1')
    expect(within(summary).getByText('Tasks remaining').nextSibling.textContent).toBe('1') // the partly done one
    expect(within(summary).getByText('Coming up').nextSibling.textContent).toBe('6') // Email Sam (moved to Wednesday) + the daily Stretch expected on each of the five remaining days
    expect(noRegion('After missed days')).toBeNull() // progress was made today
    await user.click(screen.getByRole('button', { name: /Tuesday 10 Mar, today/ }))
    const detail = await screen.findByLabelText('Tuesday 10 Mar plan')
    expect(within(detail).getByText('Stretch')).toBeTruthy()
    expect(within(detail).getByText('Write the report')).toBeTruthy()
    expect(within(detail).getByRole('link', { name: 'Open in My Day' }).getAttribute('href')).toBe('/app/day?date=2026-03-10')
    await user.click(screen.getByRole('link', { name: 'See recent weeks and recurring tasks' }))
    const habits = await screen.findByRole('region', { name: 'Recurring tasks' })
    expect(within(habits.querySelector('li')).getByText('1 of 1 planned day done')).toBeTruthy()
    const weeks = screen.getByRole('region', { name: 'Recent weeks' })
    expect(within(weeks).getByText('1 day with progress · 1 task done · 1 partly done')).toBeTruthy()

    // 6. Manage the recurring task: renaming it leaves today's finished record alone.
    await user.click(nav('Recurring Tasks'))
    await user.click(await screen.findByRole('button', { name: 'Edit Stretch' }))
    const templateForm = screen.getByRole('form', { name: 'Edit Stretch' })
    const templateTitle = within(templateForm).getByRole('textbox', { name: /^Task/ })
    await user.clear(templateTitle)
    await user.type(templateTitle, 'Evening stretch')
    await user.click(within(templateForm).getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText(/left as they are because you’ve already worked on or changed it/)).toBeTruthy()
    expect((await rows('2026-03-10')).find((r) => r.completion === 1)).toMatchObject({ title: 'Stretch' }) // history keeps its old name

    // Tomorrow already exists (the moved task is there). Its repeating tasks can be added, and they use the new name.
    await user.click(nav('My Day'))
    await screen.findByText('Write the report')
    await user.click(screen.getByRole('button', { name: 'Next day' }))
    expect(await screen.findByText('Moved from Tuesday 10 Mar')).toBeTruthy()
    await user.click(await screen.findByRole('button', { name: 'Add my repeating tasks' }))
    expect(await screen.findByText('Evening stretch')).toBeTruthy()
    await waitFor(async () => expect((await rows('2026-03-11')).map((r) => r.title)).toEqual(['Email Sam', 'Evening stretch']))
    const tuesdayAfter = await rows('2026-03-10')
    first.unmount()

    // 7. Two days later, Wednesday's plan was never touched. Coming back is welcomed, not scolded.
    vi.setSystemTime(new Date(THURSDAY))
    await setClock(world, THURSDAY)
    const wednesdayBefore = await rows('2026-03-11')
    renderAt('/app/day')
    const welcome = await screen.findByRole('region', { name: 'Welcome back' })
    expect(welcome).toHaveTextContent(WELCOME_BACK.message)
    expect(await screen.findByText('Evening stretch')).toBeTruthy() // today's own plan, nothing else
    expect(screen.queryByText('Email Sam')).toBeNull() // nothing from Wednesday was brought forward
    expect(await rows('2026-03-11')).toEqual(wednesdayBefore) // and nothing in Wednesday changed
    expect(await rows('2026-03-10')).toEqual(tuesdayAfter) // Tuesday is exactly as it was left
    await user.click(within(welcome).getByRole('button', { name: 'Dismiss' }))
    expect(noRegion('Welcome back')).toBeNull()

    // The week now carries the calm note, and Progress reflects all of it.
    await user.click(nav('Week'))
    const note = await screen.findByRole('region', { name: 'After missed days' })
    expect(note).toHaveTextContent(WEEK_NOTE.heading)
    expect(note.textContent).not.toMatch(/catch up|behind|missed|overdue|streak/i)
    await user.click(screen.getByRole('link', { name: 'See recent weeks and recurring tasks' }))
    const habitsAfter = await screen.findByRole('region', { name: 'Recurring tasks' })
    expect(within(habitsAfter).getByText('Evening stretch')).toBeTruthy()
    expect(within(habitsAfter).getByText('1 of 3 planned days done')).toBeTruthy() // Tue done; Wed and Thu not done yet
  }, 180000)
})
