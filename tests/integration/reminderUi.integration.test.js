import { createElement as h } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { setupUser } from './user.js'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import theme from '../../src/theme/theme.js'
import { createPlannerService } from '../../src/services/planner/createPlannerService.js'
import { createReminderService } from '../../src/services/reminders/createReminderService.js'
import { countRows, createTestClient, createUser, createWorld } from './harness.js'
import { CLOCK, TODAY } from '../support/plannerSeed.js'

// UI -> hooks -> REAL reminder and planner services -> the real Django API and SQLite database. Browser notifications are a stub of window.Notification: this does not prove a real browser
// shows them, and nothing here can show delivery while a page is closed (which is not supported).
const holder = vi.hoisted(() => ({ planner: null, reminders: null }))
const delegate = (key) => new Proxy({}, { get: (_, name) => (...args) => holder[key][name](...args) })
vi.mock('../../src/services/planner/index.js', () => ({ plannerService: delegate('planner') }))
vi.mock('../../src/services/reminders/index.js', () => ({ reminderService: delegate('reminders') }))

const { default: ReminderSettingsPage } = await import('../../src/pages/app/ReminderSettingsPage.jsx')
const { default: MyDayPage } = await import('../../src/pages/app/MyDayPage.jsx')
const { default: ReminderNotifier } = await import('../../src/components/reminders/ReminderNotifier.jsx')

let world
let seq = 0
beforeAll(() => {
  world = createWorld(CLOCK) // Tuesday 2026-03-10 11:00 in New York (15:00Z)
})

let userId
let planner
let reminders
beforeEach(async () => {
  userId = await createUser(world, `remui-${(seq += 1)}@example.com`, 'America/New_York')
  const client = createTestClient(world, { getUserId: () => userId })
  const clock = () => Date.parse(CLOCK)
  planner = createPlannerService({ getClient: () => client, clock })
  reminders = createReminderService({ getClient: () => client, clock })
  holder.planner = planner
  holder.reminders = reminders
})
afterEach(() => {
  delete window.Notification
})

const at = (iso) => Date.parse(iso)
const wrap = (path, element) => h(ThemeProvider, { theme }, h(MemoryRouter, { initialEntries: [path] }, element))
const renderSettings = () => render(wrap('/app/reminders', h(ReminderSettingsPage)))
const renderDay = () => render(wrap('/app/day', h(MyDayPage)))
const stubNotification = (permission) => {
  const instances = []
  const Stub = vi.fn(function (title, options) {
    instances.push({ title, options })
  })
  Stub.permission = permission
  Stub.requestPermission = vi.fn(async () => {
    Stub.permission = 'granted'
    return 'granted'
  })
  window.Notification = Stub
  return { Stub, instances }
}

describe('reminder settings screen', () => {
  it('starts off with a useful empty state and says why notifications are unavailable', async () => {
    renderSettings()
    const status = await screen.findByRole('status', { name: 'Reminder status' })
    expect(within(status).getByText('Reminders are off')).toBeTruthy()
    expect(within(status).getByText(/America\/New_York/)).toBeTruthy()
    expect(screen.getByText('No reminders coming up')).toBeTruthy()
    expect(screen.getByText(/browser doesn’t support notifications/)).toBeTruthy() // jsdom has no Notification
    expect(screen.getByText(/can’t arrive when the tab or browser is closed/)).toBeTruthy()
    expect(await countRows(world, userId, 'reminder-preferences')).toBe(0)
  })

  it('saves the switch, time and weekdays, shows the next reminder, and resets', async () => {
    const user = setupUser()
    renderSettings()
    await screen.findByRole('status', { name: 'Reminder status' })
    await user.click(screen.getByRole('switch'))
    const form = screen.getByRole('form', { name: 'Daily reminder settings' })
    await user.clear(within(form).getByLabelText('Reminder time'))
    await user.type(within(form).getByLabelText('Reminder time'), '12:00')
    await user.click(within(form).getByRole('checkbox', { name: 'Sat' }))
    await user.click(within(form).getByRole('checkbox', { name: 'Sun' }))
    await user.click(within(form).getByRole('button', { name: 'Save settings' }))
    const status = await screen.findByText('Reminders are on: 12:00, Mon, Tue, Wed, Thu, Fri')
    expect(status).toBeTruthy()
    expect(screen.getByText(/Next daily reminder: Tuesday 10 Mar at 12:00/)).toBeTruthy()
    expect(await reminders.getPreferences()).toMatchObject({ enabled: true, remindTime: '12:00', weekdays: [1, 2, 3, 4, 5] })

    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }))
    await waitFor(() => expect(within(screen.getByRole('status', { name: 'Reminder status' })).getByText('Reminders are off')).toBeTruthy())
    expect(await countRows(world, userId, 'reminder-preferences')).toBe(0)
    expect(screen.getByRole('switch').checked).toBe(false)
  })

  it('validates without saving: at least one day is required', async () => {
    const user = setupUser()
    renderSettings()
    await screen.findByRole('status', { name: 'Reminder status' })
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) await user.click(screen.getByRole('checkbox', { name: day }))
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(await screen.findByText('Choose at least one day of the week.')).toBeTruthy()
    expect((await reminders.getPreferences()).exists).toBe(false)
  })

  it('asks for browser permission only when the button is clicked, and handles denied', async () => {
    const { Stub } = stubNotification('default')
    const user = setupUser()
    renderSettings()
    await screen.findByRole('status', { name: 'Reminder status' })
    expect(Stub.requestPermission).not.toHaveBeenCalled() // no prompt on load
    await user.click(screen.getByRole('button', { name: 'Allow browser notifications' }))
    expect(Stub.requestPermission).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Browser notifications are allowed for Arcloop.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Allow browser notifications' })).toBeNull()
  })

  it('explains a blocked permission and does not offer to ask again', async () => {
    const { Stub } = stubNotification('denied')
    renderSettings()
    expect(await screen.findByText(/blocked for this site/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Allow browser notifications' })).toBeNull()
    expect(Stub.requestPermission).not.toHaveBeenCalled()
  })

  it('lists task reminders with their day and time, and removes one', async () => {
    const task = (await planner.createTask(TODAY, { title: 'Call the dentist' })).plan.occurrences[0]
    await reminders.setTaskReminder(task.id, '15:30')
    const user = setupUser()
    renderSettings()
    const list = await screen.findByLabelText('Upcoming reminders')
    expect(within(list).getByText('Call the dentist')).toBeTruthy()
    expect(within(list).getByText('Tuesday 10 Mar at 15:30')).toBeTruthy()
    expect(within(list).getByText(/Reminders are off, so these won’t be sent/)).toBeTruthy()
    await user.click(within(list).getByRole('button', { name: 'Remove reminder for Call the dentist' }))
    await waitFor(() => expect(screen.getByText('No reminders coming up')).toBeTruthy())
    expect(await reminders.listTaskReminders()).toEqual([])
  })

  it('shows a calm error with retry when loading fails', async () => {
    const user = setupUser()
    const real = holder.reminders
    holder.reminders = { ...real, getPreferences: vi.fn(real.getPreferences).mockRejectedValueOnce(new Error('relation "reminder_preferences" does not exist')) }
    renderSettings()
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText(/relation/)).toBeNull()
    await user.click(screen.getByRole('button', { name: /Try again/ }))
    await waitFor(() => expect(within(screen.getByRole('status', { name: 'Reminder status' })).getByText('Reminders are off')).toBeTruthy())
  })
})

describe('task reminders in My Day', () => {
  it('sets, changes and removes a reminder only when asked', async () => {
    await planner.createTask(TODAY, { title: 'Stretch' })
    await planner.createTask(TODAY, { title: 'Read' })
    const user = setupUser()
    renderDay()
    await screen.findByText('Stretch')
    expect(await reminders.listTaskReminders()).toEqual([]) // nothing is set automatically
    await user.click(screen.getByRole('button', { name: 'Set a reminder for Stretch' }))
    const form = screen.getByRole('form', { name: 'Reminder for Stretch' })
    const time = within(form).getByLabelText('Remind me at')
    await user.clear(time)
    await user.type(time, '10:00') // already passed (it is 11:00)
    await user.click(within(form).getByRole('button', { name: 'Save reminder' }))
    expect(await within(form).findByText('Choose a time that hasn’t passed yet.')).toBeTruthy()
    await user.clear(time)
    await user.type(time, '16:45')
    await user.click(within(form).getByRole('button', { name: 'Save reminder' }))
    expect(await screen.findByRole('button', { name: 'Change reminder for Stretch' })).toBeTruthy()
    expect(screen.getByText('Reminder at 16:45')).toBeTruthy()
    expect((await reminders.listTaskReminders()).map((r) => [r.title, r.remindTime])).toEqual([['Stretch', '16:45']])
    expect(screen.getByRole('button', { name: 'Set a reminder for Read' })).toBeTruthy() // the other task has none
    expect(screen.getByText(/Reminders are off, so this one won’t be sent/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Change reminder for Stretch' }))
    await user.click(screen.getByRole('button', { name: 'Remove reminder' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Set a reminder for Stretch' })).toBeTruthy())
    expect(await reminders.listTaskReminders()).toEqual([])
  })

  it('drops the reminder control once a task is finished', async () => {
    await planner.createTask(TODAY, { title: 'Stretch' })
    const user = setupUser()
    renderDay()
    await screen.findByText('Stretch')
    await user.click(screen.getByRole('button', { name: 'Done: Stretch' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Set a reminder for Stretch' })).toBeNull())
  })
})

describe('in-app delivery while the app is open', () => {
  const ALL = [1, 2, 3, 4, 5, 6, 7]
  let nowMs
  const clock = () => nowMs
  const renderNotifier = (n = 1) => {
    for (let i = 0; i < n; i += 1) render(wrap('/app', h(ReminderNotifier, { now: clock, tickMs: 25 })))
  }
  const notices = () => screen.queryAllByText('Your day is ready when you are')

  it('delivers the daily reminder once at the chosen local time, even with two tabs open', async () => {
    const { instances } = stubNotification('granted')
    await reminders.savePreferences({ enabled: true, remindTime: '12:00', weekdays: ALL }) // 12:00 local = 16:00Z
    nowMs = at('2026-03-10T15:00:00Z') // 11:00 local
    renderNotifier(2)
    await new Promise((r) => setTimeout(r, 150))
    expect(notices()).toHaveLength(0) // not yet
    nowMs = at('2026-03-10T16:00:00Z')
    expect(await screen.findByText('Your day is ready when you are')).toBeTruthy()
    await new Promise((r) => setTimeout(r, 300))
    expect(notices()).toHaveLength(1) // one tab claimed it; the other did not repeat it
    expect(instances).toHaveLength(1) // and one browser notification
    expect(instances[0].title).toBe('Your day is ready when you are')
    expect((await reminders.getPreferences()).lastNotifiedOn).toBe(TODAY)
    expect(screen.getByRole('link', { name: 'Open My Day' }).getAttribute('href')).toBe(`/app/day?date=${TODAY}`)
  })

  it('stays in-app when browser permission was not granted', async () => {
    const { instances } = stubNotification('denied')
    await reminders.savePreferences({ enabled: true, remindTime: '12:00', weekdays: ALL })
    nowMs = at('2026-03-10T16:05:00Z')
    renderNotifier()
    expect(await screen.findByText('Your day is ready when you are')).toBeTruthy()
    expect(instances).toHaveLength(0)
  })

  it('sends nothing when reminders are off, on an unchosen weekday, or long after the time', async () => {
    stubNotification('granted')
    nowMs = at('2026-03-10T16:05:00Z')
    renderNotifier() // preferences never saved: off
    await new Promise((r) => setTimeout(r, 200))
    expect(notices()).toHaveLength(0)
    await reminders.savePreferences({ enabled: true, remindTime: '12:00', weekdays: [1, 3] }) // not Tuesday
    window.dispatchEvent(new Event('arcloop:reminders-changed'))
    await new Promise((r) => setTimeout(r, 200))
    expect(notices()).toHaveLength(0)
    await reminders.savePreferences({ enabled: true, remindTime: '12:00', weekdays: ALL })
    nowMs = at('2026-03-10T22:00:00Z') // 18:00 local: hours after the window
    window.dispatchEvent(new Event('arcloop:reminders-changed'))
    await new Promise((r) => setTimeout(r, 200))
    expect(notices()).toHaveLength(0)
  })

  it('delivers a task reminder once, then again only after its time is changed', async () => {
    const { instances } = stubNotification('granted')
    await reminders.savePreferences({ enabled: true, remindTime: '09:00', weekdays: ALL }) // today\'s 09:00 already passed: no daily one
    const task = (await planner.createTask(TODAY, { title: 'Call the dentist' })).plan.occurrences[0]
    await reminders.setTaskReminder(task.id, '15:00') // 19:00Z
    nowMs = at('2026-03-10T18:00:00Z')
    renderNotifier(2)
    await new Promise((r) => setTimeout(r, 150))
    expect(screen.queryAllByText(/Call the dentist/)).toHaveLength(0)
    nowMs = at('2026-03-10T19:00:00Z')
    expect(await screen.findByText(/“Call the dentist” is on your plan/)).toBeTruthy()
    await new Promise((r) => setTimeout(r, 300))
    expect(screen.queryAllByText(/“Call the dentist” is on your plan/)).toHaveLength(1)
    expect(instances.filter((i) => i.options.body.includes('Call the dentist'))).toHaveLength(1)
    expect((await reminders.listTaskReminders())[0].notifiedAt).not.toBeNull()
    // Changing the time makes it deliverable again.
    expect((await reminders.setTaskReminder(task.id, '16:00')).notifiedAt).toBeNull()
  })

  it('never reminds about a task that is already finished', async () => {
    stubNotification('granted')
    await reminders.savePreferences({ enabled: true, remindTime: '09:00', weekdays: ALL })
    const task = (await planner.createTask(TODAY, { title: 'Stretch' })).plan.occurrences[0]
    await reminders.setTaskReminder(task.id, '15:00')
    await planner.setCompletion(task.id, 1)
    nowMs = at('2026-03-10T19:02:00Z')
    renderNotifier()
    await new Promise((r) => setTimeout(r, 250))
    expect(screen.queryAllByText(/Stretch/)).toHaveLength(0)
  })
})
