import { createElement as h } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import theme from '../../src/theme/theme.js'
import { createPlannerService } from '../../src/services/planner/createPlannerService.js'
import { createPgliteClient } from '../support/pgliteSupabase.js'
import { createDb, createUser, useFixedClock } from './harness.js'
import { CLOCK, TODAY, one } from './plannerSeed.js'

// ProfilePage and TimezonePrompt -> REAL profileService -> the real profiles migration (RLS, column
// grants, timezone trigger) in PGlite. Not PostgREST or a real Supabase project, and not a browser.
const holder = vi.hoisted(() => ({ client: null, userId: null, device: null, failNextUpdate: false }))
vi.mock('../../src/services/supabaseClient.js', () => ({
  isSupabaseConfigured: true,
  supabase: new Proxy({}, { get: (_, key) => holder.client[key] }),
}))
vi.mock('../../src/hooks/useAuth.js', () => ({ useAuth: () => ({ user: { id: holder.userId } }) }))
vi.mock('../../src/utils/profile.js', async (importOriginal) => ({ ...(await importOriginal()), detectDeviceTimeZone: () => holder.device }))

const { default: ProfilePage } = await import('../../src/pages/app/ProfilePage.jsx')
const { default: TimezonePrompt } = await import('../../src/components/profile/TimezonePrompt.jsx')

let db
let seq = 0
beforeAll(async () => {
  db = await createDb()
  await useFixedClock(db, CLOCK) // 2026-03-10T15:00:00Z
}, 60000)
afterAll(async () => {
  await db?.close()
})

let userId
beforeEach(async () => {
  userId = await createUser(db, `prof-${(seq += 1)}@example.com`, 'UTC')
  holder.userId = userId
  holder.device = 'Pacific/Auckland'
  holder.failNextUpdate = false
  holder.client = createPgliteClient(db, {
    getUserId: () => userId,
    hooks: { before: async (state) => { if (state.op === 'update' && holder.failNextUpdate) { holder.failNextUpdate = false; throw new Error('connection reset') } } },
  })
  localStorage.clear()
})
afterEach(() => localStorage.clear())

const profileRow = (id = userId) => one(db, 'select display_name, timezone from public.profiles where id = $1', [id])
const wrap = (path, element) => h(ThemeProvider, { theme }, h(MemoryRouter, { initialEntries: [path] }, element))
const todayFor = () => createPlannerService({ getClient: () => holder.client, clock: () => Date.parse(CLOCK) }).getToday()

describe('profile page', () => {
  it('shows the current profile and saves name and timezone', async () => {
    const user = userEvent.setup()
    render(wrap('/app/profile', h(ProfilePage)))
    const zone = await screen.findByLabelText('Timezone')
    expect(zone.value).toBe('UTC')
    await user.type(screen.getByLabelText(/Display name/), 'Asha')
    await user.selectOptions(zone, 'Asia/Kolkata')
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(await screen.findByText('Saved. Your day, week and reminders now follow Asia/Kolkata.')).toBeTruthy()
    expect(await profileRow()).toEqual({ display_name: 'Asha', timezone: 'Asia/Kolkata' })
  })

  it('offers the device timezone and applies it only when chosen', async () => {
    const user = userEvent.setup()
    render(wrap('/app/profile', h(ProfilePage)))
    await screen.findByLabelText('Timezone')
    expect((await profileRow()).timezone).toBe('UTC') // nothing changes by itself
    await user.click(screen.getByRole('button', { name: 'Use this device’s timezone (Pacific/Auckland)' }))
    expect(screen.getByLabelText('Timezone').value).toBe('Pacific/Auckland')
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    await waitFor(async () => expect((await profileRow()).timezone).toBe('Pacific/Auckland'))
  })

  it('rejects an over-long name without saving, and shows a calm message when saving fails', async () => {
    const user = userEvent.setup()
    render(wrap('/app/profile', h(ProfilePage)))
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
    const other = await createUser(db, `prof-other-${(seq += 1)}@example.com`, 'UTC')
    const user = userEvent.setup()
    render(wrap('/app/profile', h(ProfilePage)))
    await user.type(await screen.findByLabelText(/Display name/), 'Mine')
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    await waitFor(async () => expect((await profileRow()).display_name).toBe('Mine'))
    expect((await profileRow(other)).display_name).toBeNull()
  })
})

describe('timezone suggestion', () => {
  const renderPrompt = (path = '/app') => render(wrap(path, h(TimezonePrompt)))

  it('offers the device timezone while the profile is still on UTC, and applying it keeps the name and history', async () => {
    await db.query(`update public.profiles set display_name = 'Asha' where id = $1`, [userId])
    const planner = createPlannerService({ getClient: () => holder.client, clock: () => Date.parse(CLOCK) })
    const { plan } = await planner.createTask(TODAY, { title: 'Walk' })
    await planner.setCompletion(plan.occurrences[0].id, 1)
    expect((await todayFor()).today).toBe('2026-03-10')
    const changed = vi.fn()
    window.addEventListener('arcloop:profile-changed', changed)
    const user = userEvent.setup()
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
    await db.query(`update public.profiles set timezone = 'Europe/London' where id = $1`, [userId])
    renderPrompt()
    await new Promise((r) => setTimeout(r, 300))
    expect(screen.queryByRole('region', { name: 'Timezone suggestion' })).toBeNull()
    await db.query(`update public.profiles set timezone = 'UTC' where id = $1`, [userId])
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
    const user = userEvent.setup()
    const first = renderPrompt()
    await user.click(await screen.findByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('region', { name: 'Timezone suggestion' })).toBeNull()
    expect((await profileRow()).timezone).toBe('UTC')
    first.unmount()
    renderPrompt()
    await new Promise((r) => setTimeout(r, 300))
    expect(screen.queryByRole('region', { name: 'Timezone suggestion' })).toBeNull()
    localStorage.clear()
    renderPrompt('/app/profile')
    await new Promise((r) => setTimeout(r, 300))
    expect(screen.queryByRole('region', { name: 'Timezone suggestion' })).toBeNull()
  })

  it('shows a calm error and keeps the suggestion when saving fails', async () => {
    const user = userEvent.setup()
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
