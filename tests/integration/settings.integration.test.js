import { createElement as h } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { setupUser } from './user.js'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import theme from '../../src/theme/theme.js'
import { createPlannerService } from '../../src/services/planner/createPlannerService.js'
import { createReminderService } from '../../src/services/reminders/createReminderService.js'
import { createTestClient, createUser, createWorld } from './harness.js'
import { CLOCK, TODAY } from '../support/plannerSeed.js'

// SettingsPage (profile, privacy, reminders summary, account) and TimezonePrompt -> REAL profileService -> the real Django API and database (ownership, field
// rules, timezone validation). Not a browser.
const holder = vi.hoisted(() => ({ client: null, userId: null, device: null, failNextUpdate: false, failNextSelect: false }))
// The one place the app picks its data client (see src/services/backend.js): here it is the Django client of this test.
vi.mock('../../src/services/backend.js', () => ({
  backend: 'django',
  isDjango: true,
  isBackendConfigured: true,
  dataClient: new Proxy({}, { get: (_, key) => holder.client[key] }),
}))
vi.mock('../../src/hooks/useAuth.js', () => ({ useAuth: () => ({ user: { id: holder.userId, email: 'asha@example.com' } }) }))
vi.mock('../../src/utils/profile.js', async (importOriginal) => ({ ...(await importOriginal()), detectDeviceTimeZone: () => holder.device }))

const { default: SettingsPage } = await import('../../src/pages/app/SettingsPage.jsx')
const { default: TimezonePrompt } = await import('../../src/components/profile/TimezonePrompt.jsx')

let world
let seq = 0
beforeAll(() => {
  world = createWorld(CLOCK) // 2026-03-10T15:00:00Z
})

let userId
beforeEach(async () => {
  userId = await createUser(world, `prof-${(seq += 1)}@example.com`, 'UTC')
  holder.userId = userId
  holder.device = 'Pacific/Auckland'
  holder.failNextUpdate = false
  holder.failNextSelect = false
  holder.client = createTestClient(world, {
    getUserId: () => userId,
    hooks: {
      before: async (state) => {
        if (state.op === 'update' && holder.failNextUpdate) { holder.failNextUpdate = false; throw new Error('connection reset') }
        if (state.op === 'select' && state.table === 'profiles' && holder.failNextSelect) { holder.failNextSelect = false; throw new Error('connection reset') }
      },
    },
  })
  localStorage.clear()
})
afterEach(() => localStorage.clear())

const profileOf = (id) => world.users.get(id).api.get('/profile/') // what the server holds, read as the owner
const pick = (row, columns) => Object.fromEntries(columns.map((c) => [c, row[c]]))
const profileRow = async (id = userId) => pick(await profileOf(id), ['display_name', 'timezone'])
const wrap = (path, element) => h(ThemeProvider, { theme }, h(MemoryRouter, { initialEntries: [path] }, element))
const todayFor = () => createPlannerService({ getClient: () => holder.client, clock: () => Date.parse(CLOCK) }).getToday()

describe('settings: profile section', () => {
  it('shows the current profile and saves name and timezone', async () => {
    const user = setupUser()
    render(wrap('/app/settings', h(SettingsPage)))
    const zone = await screen.findByLabelText('Timezone')
    expect(zone.value).toBe('UTC')
    await user.type(screen.getByLabelText(/Display name/), 'Asha')
    await user.selectOptions(zone, 'Asia/Kolkata')
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(await screen.findByText('Saved. Your day, week and reminders now follow Asia/Kolkata.')).toBeTruthy()
    expect(await profileRow()).toEqual({ display_name: 'Asha', timezone: 'Asia/Kolkata' })
  })

  it('offers the device timezone and applies it only when chosen', async () => {
    const user = setupUser()
    render(wrap('/app/settings', h(SettingsPage)))
    await screen.findByLabelText('Timezone')
    expect((await profileRow()).timezone).toBe('UTC') // nothing changes by itself
    await user.click(screen.getByRole('button', { name: 'Use this device’s timezone (Pacific/Auckland)' }))
    expect(screen.getByLabelText('Timezone').value).toBe('Pacific/Auckland')
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    await waitFor(async () => expect((await profileRow()).timezone).toBe('Pacific/Auckland'))
  })

  it('rejects an over-long name without saving, and shows a calm message when saving fails', async () => {
    const user = setupUser()
    render(wrap('/app/settings', h(SettingsPage)))
    const name = await screen.findByLabelText(/Display name/)
    await user.click(name)
    await user.paste('x'.repeat(61))
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(await screen.findByText('Keep your name under 60 characters.')).toBeTruthy()
    expect((await profileRow()).display_name).toBeNull()
    await user.clear(name)
    await user.type(name, 'Asha')
    holder.failNextUpdate = true
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(await screen.findByText('We couldn’t save your profile. Please try again.')).toBeTruthy()
    expect(screen.queryByText(/connection reset/)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    await waitFor(async () => expect((await profileRow()).display_name).toBe('Asha'))
  })

  it('only ever changes the signed-in user\'s own profile', async () => {
    const other = await createUser(world, `prof-other-${(seq += 1)}@example.com`, 'UTC')
    const user = setupUser()
    render(wrap('/app/settings', h(SettingsPage)))
    await user.type(await screen.findByLabelText(/Display name/), 'Mine')
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    await waitFor(async () => expect((await profileRow()).display_name).toBe('Mine'))
    expect((await profileRow(other)).display_name).toBeNull()
  })
})

describe('settings: saving, discarding and coming back', () => {
  const profileForm = () => screen.getByRole('form', { name: 'Profile' })
  const privacyForm = () => screen.getByRole('form', { name: 'Privacy' })
  const row = async () => pick(await profileOf(userId), ['display_name', 'timezone', 'profile_visibility', 'progress_visibility'])

  it('keeps saved settings after leaving the page and coming back', async () => {
    const user = setupUser()
    const first = render(wrap('/app/settings', h(SettingsPage)))
    await user.type(await screen.findByLabelText(/Display name/), 'Asha')
    await user.selectOptions(screen.getByLabelText('Timezone'), 'Asia/Kolkata')
    await user.click(within(profileForm()).getByRole('button', { name: 'Save profile' }))
    await screen.findByText(/Saved\. Your day, week and reminders now follow Asia\/Kolkata\./)
    await user.click(within(privacyForm()).getByLabelText('Progress visibility'))
    await user.click(await screen.findByRole('option', { name: 'Public' }))
    await user.click(within(privacyForm()).getByRole('button', { name: 'Save privacy' }))
    await within(privacyForm()).findByText('Saved.')
    first.unmount()
    render(wrap('/app/settings', h(SettingsPage)))
    expect((await screen.findByLabelText(/Display name/)).value).toBe('Asha')
    expect(screen.getByLabelText('Timezone').value).toBe('Asia/Kolkata')
    expect(within(privacyForm()).getByLabelText('Progress visibility')).toHaveTextContent('Public')
    expect(within(privacyForm()).getByLabelText('Profile visibility')).toHaveTextContent('Private')
    expect(await row()).toEqual({ display_name: 'Asha', timezone: 'Asia/Kolkata', profile_visibility: 'private', progress_visibility: 'public' })
  })

  it('shows unsaved changes, disables Save until something changed, and discards edits', async () => {
    const user = setupUser()
    render(wrap('/app/settings', h(SettingsPage)))
    const name = await screen.findByLabelText(/Display name/)
    const save = within(profileForm()).getByRole('button', { name: 'Save profile' })
    expect(save.disabled).toBe(true)
    expect(within(profileForm()).queryByText('You have unsaved changes.')).toBeNull()
    await user.type(name, 'Draft')
    expect(save.disabled).toBe(false)
    expect(within(profileForm()).getByText('You have unsaved changes.')).toBeTruthy()
    await user.click(within(profileForm()).getByRole('button', { name: 'Discard changes' }))
    expect(name.value).toBe('')
    expect(save.disabled).toBe(true)
    expect((await row()).display_name).toBeNull() // nothing was saved
  })

  it('saves privacy on its own, without touching the profile fields or other people', async () => {
    const other = await createUser(world, `set-other-${(seq += 1)}@example.com`, 'UTC')
    const user = setupUser()
    render(wrap('/app/settings', h(SettingsPage)))
    await user.type(await screen.findByLabelText(/Display name/), 'Unsaved name')
    await user.click(within(privacyForm()).getByLabelText('Profile visibility'))
    await user.click(await screen.findByRole('option', { name: 'Public' }))
    await user.click(within(privacyForm()).getByRole('button', { name: 'Save privacy' }))
    await within(privacyForm()).findByText('Saved.')
    expect(await row()).toMatchObject({ display_name: null, profile_visibility: 'public' }) // the unsaved name was not saved
    expect(screen.getByLabelText(/Display name/).value).toBe('Unsaved name') // and the edit is still there
    expect(pick(await profileOf(other), ['profile_visibility', 'progress_visibility'])).toEqual({ profile_visibility: 'private', progress_visibility: 'private' })
  })

  it('shows a calm message when a section fails to save, and keeps the edit so it can be retried', async () => {
    const user = setupUser()
    render(wrap('/app/settings', h(SettingsPage)))
    await user.click(await within(await screen.findByRole('form', { name: 'Privacy' })).findByLabelText('Progress visibility'))
    await user.click(await screen.findByRole('option', { name: 'Public' }))
    holder.failNextUpdate = true
    await user.click(within(privacyForm()).getByRole('button', { name: 'Save privacy' }))
    expect(await within(privacyForm()).findByText('We couldn’t save your profile. Please try again.')).toBeTruthy()
    expect(screen.queryByText(/connection reset/)).toBeNull()
    expect((await row()).progress_visibility).toBe('private')
    await user.click(within(privacyForm()).getByRole('button', { name: 'Save privacy' }))
    await within(privacyForm()).findByText('Saved.')
    expect((await row()).progress_visibility).toBe('public')
  })

  it('shows reminders status and links to the reminder page instead of copying its controls', async () => {
    const first = render(wrap('/app/settings', h(SettingsPage)))
    expect(await screen.findByText('Reminders are off')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Manage reminders' }).getAttribute('href')).toBe('/app/reminders')
    expect(screen.queryByRole('switch')).toBeNull()
    first.unmount()
    const reminders = createReminderService({ getClient: () => holder.client, clock: () => Date.parse(CLOCK) })
    await reminders.savePreferences({ enabled: true, remindTime: '07:30', weekdays: [1, 3, 5] })
    render(wrap('/app/settings', h(SettingsPage)))
    expect(await screen.findByText('Reminders are on: 07:30, Mon, Wed, Fri')).toBeTruthy()
  })

  it('shows the account email and the existing password flow, and no deletion control', async () => {
    render(wrap('/app/settings', h(SettingsPage)))
    expect(await screen.findByText('asha@example.com')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Change password' }).getAttribute('href')).toBe('/update-password')
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeTruthy() // the guarded flow is offered; nothing is deleted here
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows a retry when the profile cannot be loaded, and recovers', async () => {
    const user = setupUser()
    holder.failNextSelect = true
    render(wrap('/app/settings', h(SettingsPage)))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText(/connection reset/)).toBeNull()
    await user.click(screen.getByRole('button', { name: /Try again/ }))
    expect(await screen.findByLabelText(/Display name/)).toBeTruthy()
  })
})

describe('timezone suggestion', () => {
  const renderPrompt = (path = '/app') => render(wrap(path, h(TimezonePrompt)))

  it('offers the device timezone while the profile is still on UTC, and applying it keeps the name and history', async () => {
    await world.users.get(userId).api.patch('/profile/', { display_name: 'Asha' })
    const planner = createPlannerService({ getClient: () => holder.client, clock: () => Date.parse(CLOCK) })
    const { plan } = await planner.createTask(TODAY, { title: 'Walk' })
    await planner.setCompletion(plan.occurrences[0].id, 1)
    expect((await todayFor()).today).toBe('2026-03-10')
    const changed = vi.fn()
    window.addEventListener('arcloop:profile-changed', changed)
    const user = setupUser()
    renderPrompt()
    expect(await screen.findByText(/Your timezone is set to UTC, but this device is in Pacific\/Auckland/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Use Pacific/Auckland' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Timezone suggestion' })).toBeNull())
    window.removeEventListener('arcloop:profile-changed', changed)
    expect(await profileRow()).toEqual({ display_name: 'Asha', timezone: 'Pacific/Auckland' }) // the name survived
    expect(changed).toHaveBeenCalledTimes(1)
    expect((await todayFor()).today).toBe('2026-03-11') // 04:00 on the 11th in Auckland
    const kept = (await planner.getDayPlan(TODAY)).occurrences[0]
    expect(kept).toMatchObject({ title: 'Walk', completion: 1 }) // history is not rewritten
  })

  it('stays quiet when the zone was already chosen, matches the device, or the device is UTC', async () => {
    await world.users.get(userId).api.patch('/profile/', { timezone: 'Europe/London' })
    renderPrompt()
    await new Promise((r) => setTimeout(r, 300))
    expect(screen.queryByRole('region', { name: 'Timezone suggestion' })).toBeNull()
    await world.users.get(userId).api.patch('/profile/', { timezone: 'UTC' })
    holder.device = 'UTC'
    renderPrompt()
    await new Promise((r) => setTimeout(r, 300))
    expect(screen.queryByRole('region', { name: 'Timezone suggestion' })).toBeNull()
    holder.device = null
    renderPrompt()
    await new Promise((r) => setTimeout(r, 300))
    expect(screen.queryByRole('region', { name: 'Timezone suggestion' })).toBeNull()
  })

  it('remembers "Not now", and does not appear on the profile page itself', async () => {
    const user = setupUser()
    const first = renderPrompt()
    await user.click(await screen.findByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('region', { name: 'Timezone suggestion' })).toBeNull()
    expect((await profileRow()).timezone).toBe('UTC')
    first.unmount()
    renderPrompt()
    await new Promise((r) => setTimeout(r, 300))
    expect(screen.queryByRole('region', { name: 'Timezone suggestion' })).toBeNull()
    localStorage.clear()
    renderPrompt('/app/settings')
    await new Promise((r) => setTimeout(r, 300))
    expect(screen.queryByRole('region', { name: 'Timezone suggestion' })).toBeNull()
  })

  it('shows a calm error and keeps the suggestion when saving fails', async () => {
    const user = setupUser()
    renderPrompt()
    const button = await screen.findByRole('button', { name: 'Use Pacific/Auckland' })
    holder.failNextUpdate = true
    await user.click(button)
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText(/connection reset/)).toBeNull()
    expect(screen.getByRole('region', { name: 'Timezone suggestion' })).toBeTruthy()
    expect((await profileRow()).timezone).toBe('UTC') // nothing was saved
    await user.click(screen.getByRole('button', { name: 'Use Pacific/Auckland' })) // and retrying works
    await waitFor(async () => expect((await profileRow()).timezone).toBe('Pacific/Auckland'))
  })
})
