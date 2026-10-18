import { describe, it, expect } from 'vitest'
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

describe('Contact layout', () => {
  it('shows configuration placeholders instead of an invented email', async () => {
    renderAt('/contact')
    expect(await screen.findByText('[to be configured]')).toBeInTheDocument()
  })

  it('does not claim a message was sent', async () => {
    const user = userEvent.setup()
    renderAt('/contact')
    await user.type(await screen.findByLabelText('Your email'), 'a@example.com')
    await user.type(screen.getByLabelText('Message'), 'Hello')
    await user.click(screen.getByLabelText('Topic'))
    await user.click(await screen.findByRole('option', { name: 'Question about Arcloop' }))
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    expect(await screen.findByText(/Not sent: messaging is not connected/i, {}, { timeout: 3000 })).toBeInTheDocument()
  })
})
