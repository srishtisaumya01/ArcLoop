import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { renderAt } from './renderRoute.jsx'
import LineChart from '../../src/components/charts/LineChart.jsx'
import { TOP_PARTICIPANTS } from '../../src/constants/communityDemo.js'

describe('Participants page', () => {
  it('shows the top three, the rest of the ranking, and labels everything as sample data', async () => {
    renderAt('/participants')
    await screen.findByRole('heading', { level: 1, name: 'Top participants this week' })
    const podium = screen.getByRole('list', { name: 'Top three participants' })
    expect(within(podium).getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(
      TOP_PARTICIPANTS.slice(0, 3).map((p, i) => `Rank ${i + 1}: ${p.name}`),
    )
    const table = screen.getByRole('table', { name: /ranked 4 to 8/i })
    expect(within(table).getAllByRole('row')).toHaveLength(1 + TOP_PARTICIPANTS.length - 3)
    expect(within(table).getByText('#4')).toBeInTheDocument()
    expect(screen.getByText(/Sample data: names and numbers are illustrative/)).toBeInTheDocument()
    expect(screen.getByText('Sample feedback')).toBeInTheDocument()
  })

  it('names both chart series in a legend and offers the numbers as a table', async () => {
    renderAt('/participants')
    await screen.findByRole('heading', { level: 1, name: 'Top participants this week' })
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['With n8n nudges', 'Without nudges'])
    expect(screen.getByText('View as table')).toBeInTheDocument()
  })
})

describe('How it works page', () => {
  it('explains the solo/group choice, the rules for each way to join, and the n8n architecture', async () => {
    renderAt('/how-it-works')
    await screen.findByRole('heading', { level: 1, name: 'From your first log-in to a steady streak' })
    expect(screen.getByText('Join solo, or create a group?')).toBeInTheDocument()
    expect(screen.getByText(/add each member with their name and Arcloop username/i)).toBeInTheDocument()
    for (const name of ['As an individual', 'As a friend', 'As a group']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    }
    expect(screen.getByRole('figure', { name: /planned architecture/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Daily check-in reminder' })).toBeInTheDocument()
  })
})

describe('LineChart', () => {
  const props = {
    ariaLabel: 'Test chart',
    labels: ['W1', 'W2', 'W3'],
    series: [{ key: 'a', label: 'Active', color: '#2a78d6', values: [10, 20, 30] }],
  }

  it('moves a tooltip through the points with the keyboard', () => {
    render(<LineChart {...props} />)
    const svg = screen.getByRole('img', { name: 'Test chart' })
    fireEvent.focus(svg)
    expect(screen.getByRole('status')).toHaveTextContent('W3')
    fireEvent.keyDown(svg, { key: 'ArrowLeft' })
    expect(screen.getByRole('status')).toHaveTextContent('W2Active20')
    fireEvent.keyDown(svg, { key: 'Home' })
    expect(screen.getByRole('status')).toHaveTextContent('W1')
    fireEvent.blur(svg)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('has no legend for a single series, and a table with every value', () => {
    render(<LineChart {...props} />)
    expect(screen.queryByRole('list', { name: 'Legend' })).toBeNull()
    const rows = within(screen.getByRole('table', { hidden: true })).getAllByRole('row', { hidden: true })
    expect(rows.map((r) => r.textContent)).toEqual(['WeekActive', 'W110', 'W220', 'W330'])
  })
})
