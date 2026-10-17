import { supabase } from './supabaseClient.js'
import { api, ApiError } from './api/apiClient.js'
import { isDjango } from './backend.js'
import { ROUTES } from '../constants/navigation.js'

// All authentication calls go through here. Components never touch the
// Supabase client or the API client; this module picks the backend (see services/backend.js). Errors are converted to user-friendly AuthServiceError
// messages; raw provider messages are not shown to users.

export class AuthServiceError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AuthServiceError'
    this.code = code
  }
}

function client() {
  if (!supabase) {
    throw new AuthServiceError('not_configured', 'Authentication is not available right now.')
  }
  return supabase
}

const origin = () => window.location.origin

const MESSAGES = {
  invalid_credentials: 'Email or password is incorrect.',
  email_not_confirmed: 'Please confirm your email address first. Check your inbox for the link.',
  over_request_rate_limit: 'Too many attempts. Please wait a moment and try again.',
  over_email_send_rate_limit: 'Too many emails requested. Please wait a few minutes and try again.',
  same_password: 'Choose a password you have not used before.',
  signup_disabled: 'Sign-ups are currently closed.',
  session_not_found: 'Your session has expired. Please log in again.',
  session_expired: 'Your session has expired. Please log in again.',
}

function toServiceError(error, fallback) {
  if (error instanceof AuthServiceError) return error
  const code = error?.code
  if (code === 'weak_password') {
    return new AuthServiceError(code, 'That password is too easy to guess. Try a longer or less common one.')
  }
  if (code && MESSAGES[code]) return new AuthServiceError(code, MESSAGES[code])
  if (error?.status === 429) return new AuthServiceError('rate_limited', MESSAGES.over_request_rate_limit)
  if (error?.name === 'AuthRetryableFetchError' || error?.status === 0) {
    return new AuthServiceError('network', 'We could not reach the server. Check your connection and try again.')
  }
  return new AuthServiceError('unknown', fallback)
}

// Resolves { needsConfirmation }. When email confirmation is off in the
// Supabase project a session is created immediately and the auth listener
// picks it up.
async function supabase_signUp({ email, password }) {
  const { data, error } = await client().auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: `${origin()}${ROUTES.app}` },
  })
  if (error) throw toServiceError(error, 'We could not create your account. Please try again.')
  return { needsConfirmation: !data.session }
}

async function supabase_signIn({ email, password }) {
  const { error } = await client().auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw toServiceError(error, 'We could not log you in. Please try again.')
}

// Ends this device's session only.
async function supabase_signOut() {
  const { error } = await client().auth.signOut({ scope: 'local' })
  if (error) throw toServiceError(error, 'We could not log you out. Please try again.')
}

// Supabase does not reveal whether the address has an account, and neither do we.
async function supabase_requestPasswordReset(email) {
  const { error } = await client().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${origin()}${ROUTES.updatePassword}`,
  })
  if (error) throw toServiceError(error, 'We could not send the reset email. Please try again.')
}

async function supabase_updatePassword(password) {
  const { error } = await client().auth.updateUser({ password })
  if (error) throw toServiceError(error, 'We could not update your password. Please try again.')
}

async function supabase_getSession() {
  const { data, error } = await client().auth.getSession()
  if (error) throw toServiceError(error, 'We could not check your session.')
  return data.session
}

// Subscribes to sign-in / sign-out / token refresh. Returns an unsubscribe function.
// The callback must not await Supabase calls (see Supabase docs on deadlocks).
function supabase_onAuthStateChange(callback) {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((event, session) => callback(event, session))
  return () => data.subscription.unsubscribe()
}

// --- Django API implementation -------------------------------------------------------------------------

const DJANGO_MESSAGES = {
  invalid_credentials: 'Email or password is incorrect.',
  rate_limited: 'Too many attempts. Please wait a moment and try again.',
  weak_password: 'That password is too easy to guess. Try a longer or less common one.',
  email_taken: 'An account may already exist for that email. Try logging in or resetting your password.',
  invalid_reset_link: 'This reset link is invalid or has expired. Request a new one.',
}

function toDjangoError(error, fallback) {
  if (error instanceof AuthServiceError) return error
  if (error instanceof ApiError) {
    if (error.status === 0) return new AuthServiceError('network', 'We could not reach the server. Check your connection and try again.')
    if (error.code === 'not_configured') return new AuthServiceError('not_configured', 'Authentication is not available right now.')
    if (error.code === 'validation_error' && error.fields?.password) return new AuthServiceError('weak_password', DJANGO_MESSAGES.weak_password)
    if (DJANGO_MESSAGES[error.code]) return new AuthServiceError(error.code, DJANGO_MESSAGES[error.code])
    if (error.code === 'unauthenticated') return new AuthServiceError('session_expired', MESSAGES.session_expired)
  }
  return new AuthServiceError('unknown', fallback)
}

const sessionOf = () => {
  const session = api.getSession()
  return session ? { user: session.user } : null
}

const django = {
  async signUp({ email, password }) {
    try {
      api.setSession(await api.post('/auth/register/', { email: email.trim(), password }, { authenticated: false }))
    } catch (error) {
      throw toDjangoError(error, 'We could not create your account. Please try again.')
    }
    return { needsConfirmation: false } // the API signs a new account in; email confirmation is not implemented
  },
  async signIn({ email, password }) {
    try {
      api.setSession(await api.post('/auth/login/', { email: email.trim(), password }, { authenticated: false }))
    } catch (error) {
      throw toDjangoError(error, 'We could not log you in. Please try again.')
    }
  },
  // The local session is cleared even if the server call fails, so this device is always signed out.
  async signOut() {
    let failure = null
    try {
      await api.post('/auth/logout/')
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) failure = error
    }
    api.clearSession()
    if (failure) throw toDjangoError(failure, 'We could not log you out. Please try again.')
  },
  // The API answers the same whether or not the address has an account.
  async requestPasswordReset(email) {
    try {
      await api.post('/auth/password/reset/', { email: email.trim() }, { authenticated: false })
    } catch (error) {
      throw toDjangoError(error, 'We could not send the reset email. Please try again.')
    }
  },
  // `reset` ({ uid, token }) comes from the emailed link; a signed-in change needs the current password instead.
  async updatePassword(password, { reset, currentPassword } = {}) {
    try {
      if (reset) await api.post('/auth/password/reset/confirm/', { uid: reset.uid, token: reset.token, password }, { authenticated: false })
      else await api.post('/auth/password/change/', { current_password: currentPassword ?? '', password })
    } catch (error) {
      throw toDjangoError(error, 'We could not update your password. Please try again.')
    }
  },
  // Restores the stored session and asks the server whether it is still valid. If the server cannot be
  // reached the stored session is kept, so a brief outage does not sign anyone out.
  async getSession() {
    if (!api.getSession()) return null
    try {
      await api.get('/auth/me/')
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null
    }
    return sessionOf()
  },
  onAuthStateChange(callback) {
    return api.subscribe((event) => callback(event, sessionOf()))
  },
}

export const signUp = (input) => (isDjango ? django.signUp(input) : supabase_signUp(input))
export const signIn = (input) => (isDjango ? django.signIn(input) : supabase_signIn(input))
export const signOut = () => (isDjango ? django.signOut() : supabase_signOut())
export const requestPasswordReset = (email) => (isDjango ? django.requestPasswordReset(email) : supabase_requestPasswordReset(email))
export const updatePassword = (password, options) => (isDjango ? django.updatePassword(password, options) : supabase_updatePassword(password))
export const getSession = () => (isDjango ? django.getSession() : supabase_getSession())
export const onAuthStateChange = (callback) => (isDjango ? django.onAuthStateChange(callback) : supabase_onAuthStateChange(callback))
