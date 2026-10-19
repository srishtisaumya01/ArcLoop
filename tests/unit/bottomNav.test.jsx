import { beforeEach, describe, expect, it, vi } from 'vitest'
import { configure, screen, within } from '@testing-library/react'
import { renderAt } from './renderRoute.jsx'

// The phone tab bar: on the public site (Home, How to join, Challenges, and Log in or Dashboard) and in the signed-in app (Home, My Day,
// Week, Challenges, Profile). CSS media queries do not run here, so these tests check what the bar holds, where each tab goes and
// which one is marked as the current page; that it shows only on phones is checked in a real browser (e2e/bottom-nav.spec.js).
const h = vi.hoisted(() => ({ getSession: vi.fn(), listAppChallenges: vi.fn(), listMyChallenges: vi.fn() }))

vi.mock('../../src/services/backend.js', () => ({ isBackendConfigured: true, dataClient: {} }))
vi.mock('../../src/services/authService.js', () => ({
  getSession: h.getSession,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  requestPasswordReset: vi.fn(),
  updatePassword: vi.fn(),
  onAuthStateChange: () => () => {},
}))
vi.mock('../../src/services/profileService.js', () => ({ getMyProfile: vi.fn().mockResolvedValue(null) }))
vi.mock('../../src/services/myChallengesService.js', () => ({
  CHALLENGES_CHANGED: 'arcloop:challenges-changed',
  listAppChallenges: h.listAppChallenges,
  listMyChallenges: h.listMyChallenges,
}))

const bar = () => screen.getByRole('navigation', { name: 'Quick navigation' })
const tabs = () => within(bar()).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])
const current = () => within(bar()).queryAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent)

beforeEach(() => {
  configure({ asyncUtilTimeout: 15000 })
  h.getSession.mockReset().mockResolvedValue(null)
  h.listAppChallenges.mockReset().mockResolvedValue([])
  h.listMyChallenges.mockReset().mockResolvedValue({ today: '2026-03-10', results: [] })
})

describe('The tab bar on the public site', () => {
  it('holds Home, How to join, Challenges and Log in, each going where it says', async () => {
    renderAt('/')
    await screen.findByRole('navigation', { name: 'Quick navigation' })
    expect(await within(bar()).findByRole('link', { name: 'Log in' })).toBeInTheDocument()
    expect(tabs()).toEqual([['Home', '/'], ['How to join', '/how-it-works'], ['Challenges', '/challenges'], ['Log in', '/login']])
  })

  it('marks the current page, and Home only on the home page', async () => {
    renderAt('/challenges')
    await within(await screen.findByRole('navigation', { name: 'Quick navigation' })).findByRole('link', { name: 'Log in' })
    expect(current()).toEqual(['Challenges'])
  })

  it('marks Home on the home page, and Log in on the log-in page', async () => {
    const first = renderAt('/')
    await within(await screen.findByRole('navigation', { name: 'Quick navigation' })).findByRole('link', { name: 'Log in' })
    expect(current()).toEqual(['Home'])
    first.unmount()
    renderAt('/login')
    await within(await screen.findByRole('navigation', { name: 'Quick navigation' })).findByRole('link', { name: 'Log in' })
    expect(current()).toEqual(['Log in'])
  })

  it('shows Dashboard instead of Log in for someone who is signed in', async () => {
    h.getSession.mockResolvedValue({ user: { id: 'user-1', email: 'me@example.com' } })
    renderAt('/how-it-works')
    await within(await screen.findByRole('navigation', { name: 'Quick navigation' })).findByRole('link', { name: 'Dashboard' })
    expect(tabs()).toEqual([['Home', '/'], ['How to join', '/how-it-works'], ['Challenges', '/challenges'], ['Dashboard', '/app']])
    expect(current()).toEqual(['How to join'])
  })

  it('is its own landmark, apart from the top bar', async () => {
    renderAt('/')
    await screen.findByRole('navigation', { name: 'Quick navigation' })
    expect(screen.getByRole('navigation', { name: 'Primary' })).not.toBe(bar())
  })
})

describe('The tab bar in the signed-in app', () => {
  beforeEach(() => h.getSession.mockResolvedValue({ user: { id: 'user-1', email: 'me@example.com' } }))

  it('holds Home, My Day, Week, Challenges and Profile', async () => {
    renderAt('/app/challenges')
    await screen.findByRole('navigation', { name: 'Quick navigation' })
    expect(tabs()).toEqual([['Home', '/app'], ['My Day', '/app/day'], ['Week', '/app/week'], ['Challenges', '/app/challenges'], ['Profile', '/app/profile']])
  })

  it('marks the current page; Home is not marked on the pages under /app', async () => {
    renderAt('/app/challenges')
    await screen.findByRole('navigation', { name: 'Quick navigation' })
    expect(current()).toEqual(['Challenges'])
  })

  it('keeps the rest of the app in the menu, not in the bar', async () => {
    renderAt('/app/challenges')
    await screen.findByRole('navigation', { name: 'Quick navigation' })
    for (const name of ['Progress', 'Mark Attendance', 'Recurring Tasks', 'Reminders', 'Settings']) expect(within(bar()).queryByRole('link', { name })).toBeNull()
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument()
  })
})
