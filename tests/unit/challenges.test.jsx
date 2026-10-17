import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DEMO_CHALLENGES } from '../../src/constants/demoChallenges.js'
import { renderAt } from './renderRoute.jsx'

vi.mock('../../src/services/challengeService.js', () => ({
  listChallenges: vi.fn(),
  getChallenge: vi.fn(),
}))
import { getChallenge, listChallenges } from '../../src/services/challengeService.js'

beforeEach(() => {
  listChallenges.mockReset().mockResolvedValue(DEMO_CHALLENGES)
  getChallenge.mockReset().mockImplementation(async (slug) => DEMO_CHALLENGES.find((c) => c.slug === slug) ?? null)
})

describe('Explore challenges', () => {
  it('shows a loading state, then the featured campaign and cards', async () => {
    renderAt('/challenges')
    expect(await screen.findByText('Loading challenges…')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Winter Arc 90' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Morning movement' })).toBeInTheDocument()
    expect(screen.getByText(/Demo content/i)).toBeInTheDocument()
  })

  it('filters by search text and shows an empty state with a clear action', async () => {
    const user = userEvent.setup()
    renderAt('/challenges')
    await screen.findByRole('heading', { name: 'Morning movement' })
    await user.type(screen.getByLabelText('Search challenges'), 'zzzz')
    expect(await screen.findByRole('heading', { name: /no challenges match/i })).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[0])
    expect(await screen.findByRole('heading', { name: 'Morning movement' })).toBeInTheDocument()
  })

  it('shows an error state and recovers on retry', async () => {
    const user = userEvent.setup()
    listChallenges.mockRejectedValueOnce(new Error('boom'))
    renderAt('/challenges')
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn’t load challenges/i)
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByRole('heading', { name: 'Morning movement' })).toBeInTheDocument()
  })

  it('links a card to its details page', async () => {
    const user = userEvent.setup()
    renderAt('/challenges')
    await user.click(await screen.findByRole('link', { name: 'View details: Morning movement' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Morning movement' })).toBeInTheDocument()
  })
})

describe('Challenge details', () => {
  it('shows rules, organizer and labelled sample progress', async () => {
    renderAt('/challenges/winter-arc-90')
    expect(await screen.findByRole('heading', { level: 1, name: 'Winter Arc 90' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Rules' })).toBeInTheDocument()
    expect(screen.getByText(/Official campaign/)).toBeInTheDocument()
    expect(screen.getAllByText('Sample data').length).toBeGreaterThan(0)
  })

  it('join/leave is a prototype that says nothing was saved', async () => {
    const user = userEvent.setup()
    renderAt('/challenges/morning-movement')
    await user.click(await screen.findByRole('button', { name: 'Join challenge' }))
    expect(screen.getByText(/not actually enrolled/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Leave challenge' }))
    expect(screen.getByRole('button', { name: 'Join challenge' })).toBeInTheDocument()
  })

  it('disables joining for invite-only challenges', async () => {
    renderAt('/challenges/weekly-review-circle')
    expect(await screen.findByRole('button', { name: 'Invitation required' })).toBeDisabled()
  })

  it('shows a not-found state for an unknown slug', async () => {
    renderAt('/challenges/does-not-exist')
    expect(await screen.findByRole('heading', { name: 'Challenge not found' })).toBeInTheDocument()
  })

  it('shows an error state when loading fails', async () => {
    getChallenge.mockRejectedValueOnce(new Error('boom'))
    renderAt('/challenges/winter-arc-90')
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/couldn’t load this challenge/i))
    expect(within(screen.getByRole('alert')).getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})
