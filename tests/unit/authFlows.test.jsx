import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderAt } from './renderRoute.jsx'

// Supabase is configured here, but every network-facing service is mocked.
// These tests check the app's behaviour around the services (states, guards,
// redirects), not Supabase itself.
const h = vi.hoisted(() => ({
  authCallback: null,
  unsubscribe: vi.fn(),
  getSession: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  requestPasswordReset: vi.fn(),
  updatePassword: vi.fn(),
  getMyProfile: vi.fn(),
}))

vi.mock('../../src/services/supabaseClient.js', () => ({ isSupabaseConfigured: true, supabase: {} }))
vi.mock('../../src/services/authService.js', () => ({
  getSession: h.getSession,
  signIn: h.signIn,
  signUp: h.signUp,
  signOut: h.signOut,
  requestPasswordReset: h.requestPasswordReset,
  updatePassword: h.updatePassword,
  onAuthStateChange: (cb) => {
    h.authCallback = cb
    return h.unsubscribe
  },
}))
vi.mock('../../src/services/profileService.js', () => ({ getMyProfile: h.getMyProfile }))

const session = { user: { id: 'user-1', email: 'me@example.com' } }
const deferred = () => {
  let resolve, reject
  const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)))
  return { promise, resolve, reject }
}

beforeEach(() => {
  Object.values(h).forEach((v) => typeof v?.mockReset === 'function' && v.mockReset())
  h.authCallback = null
  h.getSession.mockResolvedValue(null)
  h.getMyProfile.mockResolvedValue({
    id: 'user-1',
    display_name: null,
    timezone: 'UTC',
    interests: [],
    profile_visibility: 'private',
    progress_visibility: 'private',
  })
})

async function fillLogin(user, email = 'me@example.com', password = 'secret123') {
  await user.type(await screen.findByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Password'), password)
}

describe('Login', () => {
  it('submits credentials, then follows the auth event to the app', async () => {
    const user = userEvent.setup()
    h.signIn.mockResolvedValue(undefined)
    renderAt('/login')
    await fillLogin(user)
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(h.signIn).toHaveBeenCalledWith({ email: 'me@example.com', password: 'secret123' })
    // The provider, not the form, decides the user is signed in.
    expect(screen.queryByRole('heading', { name: /welcome to arcloop/i })).not.toBeInTheDocument()
    await act(async () => h.authCallback('SIGNED_IN', session))
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome to Arcloop' })).toBeInTheDocument()
    expect(screen.getByText('me@example.com')).toBeInTheDocument()
  })

  it('shows the error from a failed login and stays on the page', async () => {
    const user = userEvent.setup()
    h.signIn.mockRejectedValue(new Error('Email or password is incorrect.'))
    renderAt('/login')
    await fillLogin(user)
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.')
    expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled()
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument()
  })

  it('ignores a second submit while the first is pending', async () => {
    const user = userEvent.setup()
    const pending = deferred()
    h.signIn.mockReturnValue(pending.promise)
    renderAt('/login')
    await fillLogin(user)
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(screen.getByRole('button', { name: /logging in/i })).toBeDisabled()
    await user.type(screen.getByLabelText('Password'), '{Enter}')
    expect(h.signIn).toHaveBeenCalledTimes(1)
    pending.resolve()
  })

  it('does not call the service when validation fails', async () => {
    const user = userEvent.setup()
    renderAt('/login')
    await user.click(await screen.findByRole('button', { name: 'Log in' }))
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveFocus()
    expect(h.signIn).not.toHaveBeenCalled()
  })

  it('returns a user to the page they were sent from', async () => {
    const user = userEvent.setup()
    h.signIn.mockResolvedValue(undefined)
    const { router } = renderAt('/app')
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    await fillLogin(user)
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    await act(async () => h.authCallback('SIGNED_IN', session))
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome to Arcloop' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/app')
  })
})

describe('Signup', () => {
  async function fillSignup(user) {
    await user.type(await screen.findByLabelText('Email'), 'new@example.com')
    await user.type(screen.getByLabelText('Password'), 'longenough')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Create account' }))
  }

  it('shows a neutral check-your-inbox message that does not reveal whether the email exists', async () => {
    const user = userEvent.setup()
    h.signUp.mockResolvedValue({ needsConfirmation: true })
    renderAt('/signup')
    await fillSignup(user)
    expect(h.signUp).toHaveBeenCalledWith({ email: 'new@example.com', password: 'longenough' })
    expect(await screen.findByText(/If this email can be used to create an account/i)).toBeInTheDocument()
  })

  it('shows the error when sign-up fails', async () => {
    const user = userEvent.setup()
    h.signUp.mockRejectedValue(new Error('That password is too easy to guess.'))
    renderAt('/signup')
    await fillSignup(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('too easy to guess')
  })

  it('requires agreement and a long-enough password before calling the service', async () => {
    const user = userEvent.setup()
    renderAt('/signup')
    await user.type(await screen.findByLabelText('Email'), 'new@example.com')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument()
    expect(screen.getByText('Please agree to continue.')).toBeInTheDocument()
    expect(h.signUp).not.toHaveBeenCalled()
  })
})

describe('Password reset request', () => {
  it('shows the same neutral message whatever the account state', async () => {
    const user = userEvent.setup()
    h.requestPasswordReset.mockResolvedValue(undefined)
    renderAt('/forgot-password')
    await user.type(await screen.findByLabelText('Email'), 'who@example.com')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(h.requestPasswordReset).toHaveBeenCalledWith('who@example.com')
    expect(await screen.findByText(/If an account exists for that email/i)).toBeInTheDocument()
  })

  it('surfaces rate-limit errors', async () => {
    const user = userEvent.setup()
    h.requestPasswordReset.mockRejectedValue(new Error('Too many emails requested.'))
    renderAt('/forgot-password')
    await user.type(await screen.findByLabelText('Email'), 'who@example.com')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many emails requested.')
  })
})

describe('Update password (reset callback)', () => {
  it('shows a loader while the session is being restored, then the form', async () => {
    const pending = deferred()
    h.getSession.mockReturnValue(pending.promise)
    renderAt('/update-password')
    expect(await screen.findByRole('status', { name: 'Loading page' })).toBeInTheDocument()
    await act(async () => pending.resolve(session))
    expect(await screen.findByRole('heading', { level: 1, name: 'Choose a new password' })).toBeInTheDocument()
  })

  it('validates matching passwords, then updates and confirms', async () => {
    const user = userEvent.setup()
    h.getSession.mockResolvedValue(session)
    h.updatePassword.mockResolvedValue(undefined)
    renderAt('/update-password')
    await user.type(await screen.findByLabelText('New password'), 'brand-new-pass')
    await user.type(screen.getByLabelText('Confirm new password'), 'different-pass')
    await user.click(screen.getByRole('button', { name: 'Update password' }))
    expect(screen.getByText('The passwords do not match.')).toBeInTheDocument()
    expect(h.updatePassword).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText('Confirm new password'))
    await user.type(screen.getByLabelText('Confirm new password'), 'brand-new-pass')
    await user.click(screen.getByRole('button', { name: 'Update password' }))
    expect(h.updatePassword).toHaveBeenCalledWith('brand-new-pass')
    expect(await screen.findByRole('heading', { level: 1, name: 'Password updated' })).toBeInTheDocument()
  })
})

describe('Session handling and route protection', () => {
  it('restores an existing session on load and allows /app', async () => {
    h.getSession.mockResolvedValue(session)
    renderAt('/app')
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome to Arcloop' })).toBeInTheDocument()
  })

  it('shows a loader (not the login page) while the session is being restored', async () => {
    const pending = deferred()
    h.getSession.mockReturnValue(pending.promise)
    renderAt('/app')
    expect(await screen.findByRole('status', { name: 'Loading page' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Welcome back' })).not.toBeInTheDocument()
    await act(async () => pending.resolve(session))
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome to Arcloop' })).toBeInTheDocument()
  })

  it('redirects signed-in users away from the login page', async () => {
    h.getSession.mockResolvedValue(session)
    renderAt('/login')
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome to Arcloop' })).toBeInTheDocument()
  })

  it('reacts to the session ending elsewhere (sign-out or expiry)', async () => {
    h.getSession.mockResolvedValue(session)
    renderAt('/app')
    await screen.findByRole('heading', { level: 1, name: 'Welcome to Arcloop' })
    await act(async () => h.authCallback('SIGNED_OUT', null))
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument()
  })

  it('treats a failed session lookup as signed out', async () => {
    h.getSession.mockRejectedValue(new Error('network'))
    renderAt('/app')
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument()
  })

  it('unsubscribes from auth changes on unmount', async () => {
    h.getSession.mockResolvedValue(null)
    renderAt('/')
    await screen.findByRole('heading', { level: 1 })
    cleanup()
    expect(h.unsubscribe).toHaveBeenCalled()
  })

  it('logs out from the navbar and returns to the landing page', async () => {
    const user = userEvent.setup()
    h.getSession.mockResolvedValue(session)
    h.signOut.mockResolvedValue(undefined)
    const { router } = renderAt('/app')
    await screen.findByRole('heading', { level: 1, name: 'Welcome to Arcloop' })
    await user.click(screen.getAllByRole('button', { name: 'Log out' })[0])
    expect(h.signOut).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe('/')
  })

  it('shows retry when the profile request fails, and recovers', async () => {
    const user = userEvent.setup()
    h.getSession.mockResolvedValue(session)
    h.getMyProfile.mockRejectedValueOnce(new Error('rls'))
    renderAt('/app')
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn’t load your profile/i)
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText('Not set yet')).toBeInTheDocument()
  })
})
