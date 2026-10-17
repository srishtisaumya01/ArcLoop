import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderAt } from './renderRoute.jsx'

describe('routing', () => {
  it('renders the landing hero at /', async () => {
    renderAt('/')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(/build habits\.\s*keep growing\./i)
  })

  it('labels illustrative landing content as sample data', async () => {
    renderAt('/')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getAllByText(/sample/i).length).toBeGreaterThan(0)
  })

  const pages = [
    ['/challenges', 'Explore challenges'],
    ['/challenges/winter-arc-90', 'Winter Arc 90'],
    ['/login', 'Welcome back'],
    ['/signup', 'Create your account'],
    ['/forgot-password', 'Reset your password'],
    ['/privacy', 'Privacy Policy'],
    ['/terms', 'Terms of Service'],
    ['/contact', 'Contact & support'],
  ]
  it.each(pages)('renders %s with its h1', async (path, heading) => {
    renderAt(path)
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
  })

  it('renders the not-found page for unknown routes', async () => {
    renderAt('/nope')
    expect(await screen.findByRole('heading', { name: /page not found/i })).toBeInTheDocument()
  })

  it('sets the document title per page', async () => {
    renderAt('/privacy')
    await screen.findByRole('heading', { level: 1, name: 'Privacy Policy' })
    expect(document.title).toMatch(/Privacy Policy \(draft\) · Arcloop/)
  })
})
