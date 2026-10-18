import { api, ApiError } from './api/apiClient.js'

// All authentication calls go through here. Components never touch the API client. Errors are converted to
// user-friendly AuthServiceError messages; raw server messages are not shown to users.
//
// The server is the Arcloop (Django) API. Registering signs the user in at once (there is no email confirmation
// step), a session is an opaque bearer token kept by the API client, and the server checks it on every request.

export class AuthServiceError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AuthServiceError'
    this.code = code
  }
}

const MESSAGES = {
  invalid_credentials: 'Email or password is incorrect.',
  rate_limited: 'Too many attempts. Please wait a moment and try again.',
  weak_password: 'That password is too easy to guess. Try a longer or less common one.',
  email_taken: 'An account may already exist for that email. Try logging in or resetting your password.',
  invalid_reset_link: 'This reset link is invalid or has expired. Request a new one.',
  session_expired: 'Your session has expired. Please log in again.',
}

function toServiceError(error, fallback) {
  if (error instanceof AuthServiceError) return error
  if (error instanceof ApiError) {
    if (error.status === 0) return new AuthServiceError('network', 'We could not reach the server. Check your connection and try again.')
    if (error.code === 'not_configured') return new AuthServiceError('not_configured', 'Authentication is not available right now.')
    if (error.fields?.current_password) return new AuthServiceError('invalid_credentials', 'Your current password is incorrect.')
    if (error.code === 'validation_error' && error.fields?.password) return new AuthServiceError('weak_password', MESSAGES.weak_password)
    if (MESSAGES[error.code]) return new AuthServiceError(error.code, MESSAGES[error.code])
    if (error.code === 'unauthenticated') return new AuthServiceError('session_expired', MESSAGES.session_expired)
  }
  return new AuthServiceError('unknown', fallback)
}

const sessionOf = () => {
  const session = api.getSession()
  return session ? { user: session.user } : null
}

// Resolves { needsConfirmation }. The API signs a new account in, so this is always false.
export async function signUp({ email, password }) {
  try {
    api.setSession(await api.post('/auth/register/', { email: email.trim(), password }, { authenticated: false }))
  } catch (error) {
    throw toServiceError(error, 'We could not create your account. Please try again.')
  }
  return { needsConfirmation: false }
}

export async function signIn({ email, password }) {
  try {
    api.setSession(await api.post('/auth/login/', { email: email.trim(), password }, { authenticated: false }))
  } catch (error) {
    throw toServiceError(error, 'We could not log you in. Please try again.')
  }
}

// Ends this device's session only. The local session is cleared even if the server call fails, so this
// device is always signed out.
export async function signOut() {
  let failure = null
  try {
    await api.post('/auth/logout/')
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 401)) failure = error
  }
  api.clearSession()
  if (failure) throw toServiceError(failure, 'We could not log you out. Please try again.')
}

// The API answers the same whether or not the address has an account.
export async function requestPasswordReset(email) {
  try {
    await api.post('/auth/password/reset/', { email: email.trim() }, { authenticated: false })
  } catch (error) {
    throw toServiceError(error, 'We could not send the reset email. Please try again.')
  }
}

// `reset` ({ uid, token }) comes from the emailed link; a signed-in change needs the current password instead.
export async function updatePassword(password, { reset, currentPassword } = {}) {
  try {
    if (reset) await api.post('/auth/password/reset/confirm/', { uid: reset.uid, token: reset.token, password }, { authenticated: false })
    else await api.post('/auth/password/change/', { current_password: currentPassword ?? '', password })
  } catch (error) {
    throw toServiceError(error, 'We could not update your password. Please try again.')
  }
}

// Permanently deletes the signed-in account and everything it owns. The server needs the password again and the
// word DELETE, and ends every session of the account.
export async function deleteAccount({ password, confirmation }) {
  try {
    await api.post('/auth/account/delete/', { password, confirmation })
  } catch (error) {
    if (error instanceof ApiError && error.fields?.password) throw new AuthServiceError('invalid_credentials', 'Your password is incorrect.')
    if (error instanceof ApiError && error.fields?.confirmation) throw new AuthServiceError('confirmation_required', 'Type DELETE to confirm.')
    throw toServiceError(error, 'We could not delete your account. Please try again.')
  }
  api.clearSession()
}

// Restores the stored session and asks the server whether it is still valid. If the server cannot be reached
// the stored session is kept, so a brief outage does not sign anyone out.
export async function getSession() {
  if (!api.getSession()) return null
  try {
    await api.get('/auth/me/')
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
  }
  return sessionOf()
}

// Subscribes to sign-in / sign-out / expiry. Returns an unsubscribe function.
export function onAuthStateChange(callback) {
  return api.subscribe((event) => callback(event, sessionOf()))
}
