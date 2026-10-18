import { describe, it, expect, vi, beforeEach } from 'vitest'
import { configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DEMO_CHALLENGES } from '../../src/constants/demoChallenges.js'
import { renderAt } from './renderRoute.jsx'

vi.mock('../../src/services/challengeService.js', () => ({
  listChallenges: vi.fn(),
  getChallenge: vi.fn(),
}))
import { getChallenge, listChallenges } from '../../src/services/challengeService.js'

// The Explore page now renders 26 cards, which takes several seconds in jsdom on a busy machine: waiting up to 15 s (instead of the
// default 5 s) for it to appear changes no assertion.
const PAGE_WAIT = 15000
vi.setConfig({ testTimeout: 45000 }) // and the same reason for the per-test limit (20 s by default)

beforeEach(() => {
  configure({ asyncUtilTimeout: PAGE_WAIT })
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


describe('The 26-challenge library on screen', () => {
  const pick = async (user, label, option) => {
    await user.click(screen.getByLabelText(label))
    await user.click(await screen.findByRole('option', { name: option }))
  }

  it('shows all 26 sample challenges: the featured campaign and 25 cards', async () => {
    renderAt('/challenges')
    await screen.findByRole('heading', { name: 'Morning movement' })
    expect(screen.getByText('Showing 26 of 26 sample challenges')).toBeInTheDocument()
    expect(await screen.findAllByRole('article')).toHaveLength(26) // the featured panel and every card are articles
    for (const title of ['7-Day Coding Consistency', 'GitHub Green Week', 'Daily MCQ Mastery', 'Career Ready in 15 Days', 'Move Every Day', 'Digital Distraction Reset', 'Plan, Reflect & Restart']) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    }
  })

  it('offers the new categories in the filter and narrows to them', async () => {
    const user = userEvent.setup()
    renderAt('/challenges')
    await screen.findByRole('heading', { name: 'Morning movement' })
    await user.click(screen.getByLabelText('Category'))
    for (const category of ['Developers & tech', 'Exam preparation', 'College life']) expect(await screen.findByRole('option', { name: category })).toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: 'Exam preparation' }))
    expect(await screen.findByText('Showing 4 of 26 sample challenges')).toBeInTheDocument()
    for (const title of ['7-Day Revision Sprint', 'Daily MCQ Mastery', 'Answer Writing Challenge', 'Current Affairs to Recall']) expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Morning movement' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'GitHub Green Week' })).toBeNull()
  })

  it('finds a challenge by search and combines search with a category', async () => {
    const user = userEvent.setup()
    renderAt('/challenges')
    await screen.findByRole('heading', { name: 'Morning movement' })
    await user.type(screen.getByLabelText('Search challenges'), 'github')
    expect(await screen.findByText('Showing 1 of 26 sample challenges')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'GitHub Green Week' })).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Search challenges'))
    await pick(user, 'Category', 'Fitness')
    await user.type(screen.getByLabelText('Search challenges'), 'stretch')
    expect(await screen.findByText('Showing 1 of 26 sample challenges')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mobility & Stretch Breaks' })).toBeInTheDocument()
  })

  it('opens a new challenge from its card and shows what people will do', async () => {
    const user = userEvent.setup()
    renderAt('/challenges')
    await user.click(await screen.findByRole('link', { name: 'View details: GitHub Green Week' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'GitHub Green Week' })).toBeInTheDocument()
  })

  it('details: the description, rules, daily actions and the completion rule are all there', async () => {
    renderAt('/challenges/github-green-week')
    await screen.findByRole('heading', { level: 1, name: 'GitHub Green Week' })
    const challenge = DEMO_CHALLENGES.find((c) => c.slug === 'github-green-week')
    expect(screen.getByText(challenge.description)).toBeInTheDocument()
    const about = screen.getByRole('heading', { name: 'About this challenge' }).closest('section')
    expect(within(about).getByText(/Sample organizer/)).toBeInTheDocument()
    const habits = screen.getByRole('heading', { name: 'Habits and goals' }).closest('section')
    for (const action of challenge.habits) expect(within(habits).getByText(action)).toBeInTheDocument()
    const rules = screen.getByRole('heading', { name: 'Rules' }).closest('section')
    expect(within(rules).getAllByRole('listitem')).toHaveLength(challenge.rules.length)
    expect(within(rules).getByText(/No empty, trivial or artificial commits/)).toBeInTheDocument()
    const progress = screen.getByRole('heading', { name: 'How progress is counted' }).closest('section')
    expect(within(progress).getByText('One credit per day you make one real improvement.')).toBeInTheDocument()
    // facts: the right category and duration, public, sample content labelled
    expect(screen.getAllByText('Developers & tech').length).toBeGreaterThan(0)
    expect(screen.getAllByText('7 days').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Public').length).toBeGreaterThan(0)
    expect(screen.getByText(/Demo content/i)).toBeInTheDocument()
  })

  it('every added challenge opens, with its title, description and every daily action', async () => {
    for (const challenge of DEMO_CHALLENGES.slice(6)) {
      const { unmount } = renderAt(`/challenges/${challenge.slug}`)
      expect(await screen.findByRole('heading', { level: 1, name: challenge.title }), challenge.slug).toBeInTheDocument()
      expect(screen.getByText(challenge.description)).toBeInTheDocument()
      for (const action of challenge.habits) expect(screen.getByText(action), `${challenge.slug}: ${action}`).toBeInTheDocument()
      expect(screen.getByText(challenge.scoring)).toBeInTheDocument()
      unmount()
    }
  }, 60000)

  it('fitness details carry the safety wording: rest and a health-professional note', async () => {
    renderAt('/challenges/move-every-day')
    await screen.findByRole('heading', { level: 1, name: 'Move Every Day' })
    expect(screen.getByText(/talk to a health professional/i)).toBeInTheDocument()
    expect(screen.getByText(/Stop if something hurts/)).toBeInTheDocument()
  })

  it('join and leave still work as a prototype on a new challenge, and say nothing was saved', async () => {
    const user = userEvent.setup()
    renderAt('/challenges/read-every-day')
    await user.click(await screen.findByRole('button', { name: 'Join challenge' }))
    expect(screen.getByText(/not actually enrolled/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Leave challenge' }))
    expect(screen.getByRole('button', { name: 'Join challenge' })).toBeInTheDocument()
    expect(screen.getByText(/Prototype: joining is not connected to an account yet/)).toBeInTheDocument()
  })

  it('the Join link on a card goes to the join panel of the new challenge', async () => {
    renderAt('/challenges')
    const join = await screen.findByRole('link', { name: 'Join Daily MCQ Mastery' })
    expect(join.getAttribute('href')).toBe('/challenges/mcq-mastery#join')
  })
})
