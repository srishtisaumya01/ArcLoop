import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderAt } from './renderRoute.jsx'

// The API address is NOT configured in the test environment, so these cover the
// client-side behaviour that does not depend on a backend. Backend-connected
// flows are in authFlows.test.jsx (mocked services).

describe('Auth form validation (unconfigured)', () => {
  it('login: shows an unavailable notice and disables submit instead of faking a login', async () => {
    renderAt('/login')
    expect(await screen.findByText(/Accounts are not available right now/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log in' })).toBeDisabled()
  })

  it('toggles password visibility accessibly', async () => {
    const user = userEvent.setup()
    renderAt('/login')
    const input = await screen.findByLabelText('Password')
    expect(input).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(input).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('links between login, signup and password reset', async () => {
    renderAt('/login')
    expect(await screen.findByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/signup')
    expect(screen.getByRole('link', { name: 'Forgot your password?' })).toHaveAttribute('href', '/forgot-password')
  })

  it('signup page renders with the same unavailable notice', async () => {
    renderAt('/signup')
    expect(await screen.findByRole('heading', { level: 1, name: 'Create your account' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled()
  })
})

describe('Protected routes (unconfigured)', () => {
  it('sends visitors from /app to the login page', async () => {
    renderAt('/app')
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument()
  })

  it('shows the logged-out navigation', async () => {
    renderAt('/')
    expect((await screen.findAllByRole('link', { name: 'Log in' })).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument()
  })

  it('shows an expired-link message on /update-password without a session', async () => {
    renderAt('/update-password')
    expect(await screen.findByRole('heading', { level: 1, name: 'This link has expired' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/forgot-password')
  })
})

describe('Contact page', () => {
  it('shows the support email as a mail link', async () => {
    renderAt('/contact')
    // The address is shown on the page and again in the footer; every one of them is a mail link.
    const links = await screen.findAllByRole('link', { name: 'arcloopoct@gmail.com' })
    expect(links.length).toBeGreaterThan(0)
    links.forEach((link) => expect(link).toHaveAttribute('href', 'mailto:arcloopoct@gmail.com'))
  })

  it('opens an email addressed to support and says plainly that nothing was sent yet', async () => {
    // jsdom cannot navigate to a mailto: link and reports that on the console; the test only needs the form's behaviour.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()
    renderAt('/contact')
    await user.type(await screen.findByLabelText('Your email'), 'a@example.com')
    await user.type(screen.getByLabelText('Message'), 'Hello there')
    await user.click(screen.getByLabelText('Topic'))
    await user.click(await screen.findByRole('option', { name: 'Question about Arcloop' }))
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    expect(await screen.findByText(/It has not been sent yet: press send there/i)).toBeInTheDocument()
    const again = screen.getByRole('link', { name: 'Open email again' })
    const href = again.getAttribute('href')
    expect(href).toMatch(/^mailto:arcloopoct@gmail\.com\?subject=/)
    expect(decodeURIComponent(href)).toContain('[Arcloop] Question about Arcloop')
    expect(decodeURIComponent(href)).toContain('Hello there')
    consoleError.mockRestore()
  })
})
