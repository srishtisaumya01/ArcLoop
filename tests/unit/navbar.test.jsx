import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderAt } from './renderRoute.jsx'

// Supabase is "configured" but every network-facing service is mocked: these tests check which
// navigation each kind of visitor sees, not any backend.
const h = vi.hoisted(() => ({ getSession: vi.fn(), getMyProfile: vi.fn() }))

vi.mock('../../src/services/supabaseClient.js', () => ({ isSupabaseConfigured: true, supabase: {} }))
vi.mock('../../src/services/authService.js', () => ({
  getSession: h.getSession,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  requestPasswordReset: vi.fn(),
  updatePassword: vi.fn(),
  onAuthStateChange: () => () => {},
}))
vi.mock('../../src/services/profileService.js', () => ({
  getMyProfile: h.getMyProfile,
  getMyTimezone: vi.fn().mockResolvedValue('Europe/London'),
  updateMyProfile: vi.fn(),
}))

const profile = { id: 'user-1', display_name: null, timezone: 'Europe/London', interests: [], profile_visibility: 'private', progress_visibility: 'private' }

beforeEach(() => {
  h.getSession.mockReset()
  h.getMyProfile.mockReset()
  h.getMyProfile.mockResolvedValue(profile)
})

describe('navigation', () => {
  it('gives signed-in people the app links, with the right destinations', async () => {
    h.getSession.mockResolvedValue({ user: { id: 'user-1', email: 'me@example.com' } })
    renderAt('/app')
    const nav = await screen.findByRole('navigation', { name: 'App' })
    expect(within(nav).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['My Day', '/app/day'],
      ['Week', '/app/week'],
      ['Recurring Tasks', '/app/recurring'],
      ['Reminders', '/app/reminders'],
      ['Settings', '/app/settings'],
    ])
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull() // public links are not shown
  })

  it('offers the same links in the mobile menu and marks the current page', async () => {
    h.getSession.mockResolvedValue({ user: { id: 'user-1', email: 'me@example.com' } })
    const user = userEvent.setup()
    renderAt('/app')
    await user.click(await screen.findByRole('button', { name: 'Open menu' }))
    const mobile = await screen.findByRole('navigation', { name: 'Mobile' })
    expect(within(mobile).getAllByRole('link').map((a) => a.textContent)).toEqual(['My Day', 'Week', 'Recurring Tasks', 'Reminders', 'Settings'])
    await user.click(within(mobile).getByRole('link', { name: 'Settings' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy()
    const nav = screen.getByRole('navigation', { name: 'App' })
    expect(within(nav).getByRole('link', { name: 'Settings' }).getAttribute('aria-current')).toBe('page')
    expect(within(nav).getByRole('link', { name: 'Week' }).getAttribute('aria-current')).toBeNull()
  })

  it('keeps the public links for visitors who are signed out', async () => {
    h.getSession.mockResolvedValue(null)
    renderAt('/')
    const nav = await screen.findByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Challenges' })).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'App' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull()
  })
})
