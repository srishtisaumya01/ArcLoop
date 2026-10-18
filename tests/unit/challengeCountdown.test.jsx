import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import theme from '../../src/theme/theme.js'
import ChallengeBanner from '../../src/components/challenge/ChallengeBanner.jsx'
import WinterArcTracker from '../../src/components/landing/WinterArcTracker.jsx'

const wrap = (ui) => render(<ThemeProvider theme={theme}><MemoryRouter>{ui}</MemoryRouter></ThemeProvider>)

// 18 October 2026, early afternoon: Winter Arc 90 began on 1 October, so this is its 18th day.
const OCT_18 = new Date(2026, 9, 18, 13, 0, 0)

describe('challenge countdown banner', () => {
  it('shows the day number, the time left and a link to join', () => {
    wrap(<ChallengeBanner now={OCT_18} />)
    const banner = screen.getByRole('region', { name: 'Challenge countdown' })
    expect(within(banner).getByText('Winter Arc 90')).toBeInTheDocument()
    expect(within(banner).getByText('Day 18 of 90')).toBeInTheDocument()
    expect(within(banner).getByText(/^72d 11h 00m 00s left$/)).toBeInTheDocument()
    expect(within(banner).getByRole('link', { name: /Join now/ })).toHaveAttribute('href', '/challenges/winter-arc-90')
  })

  it('can be dismissed', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    wrap(<ChallengeBanner now={OCT_18} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('region', { name: 'Challenge countdown' })).toBeNull()
    sessionStorage.clear()
  })

  it('says when the challenge has not started or is over', () => {
    const { unmount } = wrap(<ChallengeBanner now={new Date(2026, 8, 28, 12, 0, 0)} />)
    expect(screen.getByText(/^Starts in 2d/)).toBeInTheDocument()
    unmount()
    wrap(<ChallengeBanner now={new Date(2027, 0, 5, 12, 0, 0)} />)
    expect(screen.getByText('Challenge complete')).toBeInTheDocument()
  })
})

describe('Winter Arc tracker', () => {
  it('shows day 18 of 90 with the countdown and one square per day', () => {
    wrap(<WinterArcTracker now={OCT_18} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Winter Arc 90' })).toBeInTheDocument()
    expect(screen.getAllByText('18').length).toBeGreaterThan(0)
    expect(screen.getByText('72 days left')).toBeInTheDocument()
    const timer = screen.getByRole('timer', { name: 'Time left in the challenge' })
    expect(within(timer).getByText('72')).toBeInTheDocument()
    expect(within(timer).getByText('11')).toBeInTheDocument()
    const grid = screen.getByRole('img', { name: 'Day 18 of 90: 17 days done, 72 days to go' })
    expect(grid.children).toHaveLength(90)
  })

  it('is on the home page', async () => {
    const { renderAt } = await import('./renderRoute.jsx')
    renderAt('/')
    expect(await screen.findByRole('heading', { level: 2, name: 'Winter Arc 90' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Challenge countdown' })).toBeInTheDocument()
  })
})
