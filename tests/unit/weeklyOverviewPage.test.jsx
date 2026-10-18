import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderAt } from './renderRoute.jsx'
import { summarizeWeek } from '../../src/utils/planner/index.js'
import { ctx, makeDay, makeOcc } from './planner/fixtures.js'

// Auth and the planner service are mocked; the week data itself is produced by the real
// pure summarizeWeek, so these tests check the screen against genuine data shapes.
const h = vi.hoisted(() => ({ getSession: vi.fn(), getWeekSummary: vi.fn() }))

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
vi.mock('../../src/services/planner/index.js', () => ({ plannerService: { getWeekSummary: h.getWeekSummary } }))

const rec = (planDate, occs, dayMode = 'normal') => ({ day: makeDay({ planDate, dayMode }), occurrences: occs.map((o) => makeOcc({ planDate, ...o })) })
// Today in the fixtures is Tuesday 2026-03-10.
const weekOf = (date, days = []) => summarizeWeek({ weekOf: date, days }, ctx())

const currentWeek = () =>
  weekOf('2026-03-09', [
    rec('2026-03-09', [{ title: 'Stretch', completion: 1 }, { title: 'Read', completion: 0 }]),
    rec('2026-03-10', [{ title: 'Walk', completion: 0.5 }]),
    rec('2026-03-11', [], 'rest'),
    rec('2026-03-12', [{ title: 'Plan trip', estimatedMinutes: 45 }]),
  ])

beforeEach(() => {
  h.getSession.mockReset()
  h.getWeekSummary.mockReset()
  h.getSession.mockResolvedValue({ user: { id: 'user-1', email: 'me@example.com' } })
  h.getWeekSummary.mockImplementation(async ({ weekOf: w } = {}) => (w && w !== '2026-03-09' ? weekOf(w) : currentWeek()))
})

describe('Weekly Overview page', () => {
  it('requires sign-in', async () => {
    h.getSession.mockResolvedValue(null)
    const { router } = renderAt('/app/week')
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/login'), { timeout: 5000 })
    expect(h.getWeekSummary).not.toHaveBeenCalled()
    cleanup()
  })

  it('shows a loading state, then the week with a current-week indicator and summary', async () => {
    renderAt('/app/week')
    expect(await screen.findByLabelText('Loading your week')).toBeTruthy()
    expect(await screen.findByText('This week')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '9 Mar to 15 Mar 2026' })).toBeTruthy()
    const summary = screen.getByLabelText('Week summary')
    expect(within(summary).getByText('Tasks completed').nextSibling.textContent).toBe('1')
    expect(within(summary).getByText('Tasks remaining').nextSibling.textContent).toBe('2')
    expect(within(summary).getByText('Coming up').nextSibling.textContent).toBe('1')
    expect(within(summary).getByText(/appears once at least 3 days/)).toBeTruthy()
  })

  it('tells empty, rest, upcoming and incomplete days apart in words', async () => {
    renderAt('/app/week')
    await screen.findByText('This week')
    const days = screen.getByLabelText('Days of the week')
    expect(within(days).getByRole('button', { name: /Monday 9 Mar: In progress/ })).toBeTruthy()
    expect(within(days).getByRole('button', { name: /Wednesday 11 Mar: Rest day planned|Wednesday 11 Mar: Rest day/ })).toBeTruthy()
    expect(within(days).getByRole('button', { name: /Thursday 12 Mar: Planned. 1 task planned/ })).toBeTruthy()
    expect(within(days).getByRole('button', { name: /Friday 13 Mar: Nothing planned yet/ })).toBeTruthy()
    expect(within(days).getByRole('button', { name: /Tuesday 10 Mar, today/ })).toBeTruthy()
    // Visual regression (found in a Chromium check): marking today must not add text to the date line, which wrapped
    // to two lines and pushed today's card out of line with its neighbours. Today is a separate badge instead.
    const todayCard = within(days).getByRole('button', { name: /Tuesday 10 Mar, today/ })
    expect(within(todayCard).getByText('Tue 10 Mar')).toBeTruthy()
    expect(within(todayCard).getByText('Today')).toBeTruthy()
    expect(within(within(days).getByRole('button', { name: /Monday 9 Mar/ })).queryByText('Today')).toBeNull()
  })

  it('shows the selected day\'s plan and puts the choice in the URL', async () => {
    const user = userEvent.setup()
    const { router } = renderAt('/app/week')
    await screen.findByText('This week')
    await user.click(screen.getByRole('button', { name: /Monday 9 Mar/ }))
    const detail = await screen.findByLabelText('Monday 9 Mar plan')
    expect(within(detail).getByText('Stretch')).toBeTruthy()
    expect(within(detail).getByText('Read')).toBeTruthy()
    expect(router.state.location.search).toContain('day=2026-03-09')
    expect(screen.getByRole('button', { name: /Monday 9 Mar/ }).getAttribute('aria-pressed')).toBe('true')
    expect(within(detail).getByRole('link', { name: 'Open in My Day' }).getAttribute('href')).toBe('/app/day?date=2026-03-09')
  })

  it('navigates to the previous and next week and back', async () => {
    const user = userEvent.setup()
    const { router } = renderAt('/app/week')
    await screen.findByText('This week')
    await user.click(screen.getByRole('button', { name: 'Previous week' }))
    expect(await screen.findByRole('heading', { name: '2 Mar to 8 Mar 2026' })).toBeTruthy()
    expect(h.getWeekSummary).toHaveBeenLastCalledWith({ weekOf: '2026-03-02' })
    expect(screen.queryByText('This week')).toBeNull()
    expect(screen.getByText('Nothing planned this week')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Next week' }))
    expect(await screen.findByRole('heading', { name: '9 Mar to 15 Mar 2026' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Next week' }))
    expect(await screen.findByRole('heading', { name: '16 Mar to 22 Mar 2026' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Back to this week' }))
    expect(await screen.findByText('This week')).toBeTruthy()
    expect(router.state.location.search).toBe('')
  })

  it('opens the week in ?week= (snapped to Monday) and ignores an invalid value', async () => {
    renderAt('/app/week?week=2026-03-04')
    expect(await screen.findByRole('heading', { name: '2 Mar to 8 Mar 2026' })).toBeTruthy()
    expect(h.getWeekSummary).toHaveBeenCalledWith({ weekOf: '2026-03-02' })
    cleanup()
    h.getWeekSummary.mockClear()
    renderAt('/app/week?week=garbage')
    expect(await screen.findByText('This week')).toBeTruthy()
    expect(h.getWeekSummary).toHaveBeenCalledWith({ weekOf: undefined })
  })

  it('shows a calm error with a retry, and recovers', async () => {
    const user = userEvent.setup()
    h.getWeekSummary.mockRejectedValueOnce(new Error('network down'))
    renderAt('/app/week')
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText(/Your plans are safe/)).toBeTruthy()
    expect(screen.queryByText(/network down/)).toBeNull()
    await user.click(screen.getByRole('button', { name: /Try again/ }))
    expect(await screen.findByText('This week')).toBeTruthy()
  })

  it('refreshes when the tab becomes visible so changes appear', async () => {
    renderAt('/app/week')
    await screen.findByText('This week')
    const before = h.getWeekSummary.mock.calls.length
    h.getWeekSummary.mockResolvedValue(
      weekOf('2026-03-09', [rec('2026-03-09', [{ title: 'Stretch', completion: 1 }, { title: 'Read', completion: 1 }])]),
    )
    document.dispatchEvent(new Event('visibilitychange'))
    const summary = screen.getByLabelText('Week summary')
    await vi.waitFor(() => expect(within(summary).getByText('Tasks completed').nextSibling.textContent).toBe('2'))
    expect(h.getWeekSummary.mock.calls.length).toBeGreaterThan(before)
  })
})
