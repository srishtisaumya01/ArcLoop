import { supabase } from './supabaseClient.js'
import { ROUTES } from '../constants/navigation.js'

// All authentication calls go through here. Components never touch the
// Supabase client. Errors are converted to user-friendly AuthServiceError
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
export async function signUp({ email, password }) {
  const { data, error } = await client().auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: `${origin()}${ROUTES.app}` },
  })
  if (error) throw toServiceError(error, 'We could not create your account. Please try again.')
  return { needsConfirmation: !data.session }
}

export async function signIn({ email, password }) {
  const { error } = await client().auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw toServiceError(error, 'We could not log you in. Please try again.')
}

// Ends this device's session only.
export async function signOut() {
  const { error } = await client().auth.signOut({ scope: 'local' })
  if (error) throw toServiceError(error, 'We could not log you out. Please try again.')
}

// Supabase does not reveal whether the address has an account, and neither do we.
export async function requestPasswordReset(email) {
  const { error } = await client().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${origin()}${ROUTES.updatePassword}`,
  })
  if (error) throw toServiceError(error, 'We could not send the reset email. Please try again.')
}

export async function updatePassword(password) {
  const { error } = await client().auth.updateUser({ password })
  if (error) throw toServiceError(error, 'We could not update your password. Please try again.')
}

export async function getSession() {
  const { data, error } = await client().auth.getSession()
  if (error) throw toServiceError(error, 'We could not check your session.')
  return data.session
}

// Subscribes to sign-in / sign-out / token refresh. Returns an unsubscribe function.
// The callback must not await Supabase calls (see Supabase docs on deadlocks).
export function onAuthStateChange(callback) {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((event, session) => callback(event, session))
  return () => data.subscription.unsubscribe()
}
