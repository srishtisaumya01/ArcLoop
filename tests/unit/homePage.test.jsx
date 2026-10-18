import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { renderAt } from './renderRoute.jsx'
import CountUp from '../../src/components/ui/CountUp.jsx'
import { COMMUNITY_STATS } from '../../src/constants/communityDemo.js'

describe('Home page', () => {
  it('shows motivating community stats, labelled as sample data', async () => {
    renderAt('/')
    await screen.findByRole('heading', { level: 1 })
    const section = screen.getByRole('region', { name: /community highlights/i })
    for (const stat of COMMUNITY_STATS) {
      expect(within(section).getByText(stat.label)).toBeInTheDocument()
    }
    expect(within(section).getAllByText('1,010').length).toBeGreaterThan(0)
    expect(within(section).getByText(/Sample data: illustrative community numbers/)).toBeInTheDocument()
  })

  it('has growth charts, the automation flow, and the plan for joining as a group', async () => {
    renderAt('/')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByRole('heading', { name: 'People who start together keep going' })).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: /line chart/i })).toHaveLength(2)
    expect(screen.getByRole('figure', { name: /planned flow/i })).toBeInTheDocument()

    const plan = screen.getByRole('list', { name: 'Steps' })
    expect(within(plan).getAllByRole('listitem').map((li) => li.querySelector('p, span')?.textContent ?? '')).toHaveLength(5)
    for (const step of ['Pick a challenge', 'Create your group', 'Add your friends', 'Everyone accepts', 'Start together']) {
      expect(within(plan).getByText(new RegExp(step))).toBeInTheDocument()
    }
    expect(within(plan).getByText(/Enter each member’s name and Arcloop username/)).toBeInTheDocument()
  })

  it('does not name the technology behind the app', async () => {
    renderAt('/')
    await screen.findByRole('heading', { level: 1 })
    expect(document.body.textContent).not.toMatch(/\b(vercel|render|neon|django|postgres|n8n)\b/i)
  })

  it('has no separate Groups link in the navigation', async () => {
    renderAt('/')
    const nav = await screen.findByRole('navigation', { name: 'Primary' })
    expect(within(nav).queryByRole('link', { name: 'Groups' })).toBeNull()
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['How it works', 'Challenges', 'Participants', 'FAQ'])
  })
})

describe('CountUp', () => {
  it('reads out the final value once, with its suffix', () => {
    render(<CountUp value={74} suffix="%" />)
    expect(screen.getAllByText('74%').length).toBeGreaterThan(0)
  })
})
