import { beforeEach, describe, expect, it, vi } from 'vitest'
import { configure, screen, within } from '@testing-library/react'
import { renderAt } from './renderRoute.jsx'
import { DEMO_CHALLENGES, CHALLENGE_CATEGORIES } from '../../src/constants/demoChallenges.js'
import { groupByCategory } from '../../src/utils/groupByCategory.js'

// The signed-in Challenges page lists every challenge the API returns under one heading per category. The API and the
// session are mocked; the rows have the shape the API sends (`duration_days`, `enrollment`).
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

const row = (c) => ({ slug: c.slug, title: c.title, category: c.category, summary: c.summary, duration_days: c.durationDays, enrollment: null })
const custom = { slug: 'my-own-abc', title: 'My own thing', category: 'My challenge', summary: 'Just for me.', duration_days: 5, enrollment: null }

beforeEach(() => {
  configure({ asyncUtilTimeout: 15000 })
  h.getSession.mockReset().mockResolvedValue({ user: { id: 'user-1', email: 'me@example.com' } })
  h.listMyChallenges.mockReset().mockResolvedValue({ today: '2026-03-10', results: [] })
  h.listAppChallenges.mockReset().mockResolvedValue([custom, ...DEMO_CHALLENGES.map(row)]) // the custom one first: it must still come last
})

describe('groupByCategory', () => {
  it('puts the library categories first in their own order, then anything else, and keeps the order inside a category', () => {
    const groups = groupByCategory([custom, ...DEMO_CHALLENGES.map(row)])
    expect(groups.map((g) => g.category)).toEqual([...CHALLENGE_CATEGORIES, 'My challenge'])
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(27)
    expect(groups.find((g) => g.category === 'Fitness').items.map((c) => c.slug)).toEqual(['morning-movement', 'move-every-day', 'gym-consistency', 'mobility-stretch-breaks'])
  })

  it('returns nothing for nothing', () => {
    expect(groupByCategory([])).toEqual([])
  })
})

describe('The signed-in Challenges page', () => {
  it('shows all 26 library challenges, and a person’s own, under their categories', async () => {
    renderAt('/app/challenges')
    await screen.findByRole('heading', { level: 3, name: /^Developers & tech/ })
    const headings = screen.getAllByRole('heading', { level: 3 }).map((e) => e.textContent.replace(/\s*\(\d+\)$/, '').trim())
    expect(headings).toEqual(expect.arrayContaining(CHALLENGE_CATEGORIES))
    expect(headings.indexOf('My challenge')).toBe(headings.length - 1)
    const allSection = screen.getByRole('heading', { name: 'All challenges' }).closest('section')
    expect(within(allSection).getAllByRole('heading', { level: 4 })).toHaveLength(27) // 26 library challenges and the person’s own
  })

  it('puts each challenge under its own category, with the count on the heading', async () => {
    renderAt('/app/challenges')
    const exam = (await screen.findByRole('heading', { level: 3, name: /^Exam preparation/ })).closest('section')
    expect(screen.getByRole('heading', { level: 3, name: /^Exam preparation/ })).toHaveTextContent('(4)')
    for (const title of ['7-Day Revision Sprint', 'Daily MCQ Mastery', 'Answer Writing Challenge', 'Current Affairs to Recall']) {
      expect(within(exam).getByRole('heading', { level: 4, name: title })).toBeInTheDocument()
    }
    expect(within(exam).queryByRole('heading', { name: 'GitHub Green Week' })).toBeNull()
    const dev = screen.getByRole('heading', { level: 3, name: /^Developers & tech/ }).closest('section')
    expect(within(dev).getByRole('link', { name: /GitHub Green Week/ })).toHaveAttribute('href', '/app/challenges/github-green-week')
  })

  it('gives every category region its heading as its accessible name, with ids a screen reader can follow', async () => {
    renderAt('/app/challenges')
    await screen.findByRole('heading', { level: 3, name: /^Developers & tech/ })
    const counts = { 'Personal growth': 3, Fitness: 4, Learning: 3, Wellness: 2, Creative: 1, Professional: 1, 'Developers & tech': 4, 'Exam preparation': 4, 'College life': 4, 'My challenge': 1 }
    const allSection = screen.getByRole('heading', { name: 'All challenges' }).closest('section')
    for (const [category, count] of Object.entries(counts)) {
      // By role and name: this is the accessible name the browser works out, so an id a screen reader cannot follow fails here.
      const region = within(allSection).getByRole('region', { name: `${category} (${count})` })
      expect(within(region).getAllByRole('heading', { level: 4 })).toHaveLength(count)
    }
    // And the markup behind it: each region points at exactly one id, that id has no spaces, it is unique, and it sits on the visible heading.
    const regions = allSection.querySelectorAll('section[aria-labelledby]')
    expect(regions).toHaveLength(10)
    const ids = [...regions].map((r) => r.getAttribute('aria-labelledby'))
    expect(new Set(ids).size).toBe(10)
    for (const region of regions) {
      const id = region.getAttribute('aria-labelledby')
      expect(id).toMatch(/^[A-Za-z][A-Za-z0-9_-]*$/)
      expect(document.querySelectorAll(`[id="${id}"]`)).toHaveLength(1)
      expect(region.querySelector(`h3[id="${id}"]`)).not.toBeNull()
    }
  })
})
