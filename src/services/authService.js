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
  invalid_credentials: 'Username or password is incorrect.',
  username_taken: 'That username is taken. Try another.',
  rate_limited: 'Too many attempts. Please wait a moment and try again.',
  weak_password: 'That password is too easy to guess. Try a longer or less common one.',
  email_taken: 'An account may already exist for that email. Try logging in or resetting your password.',
  invalid_reset_link: 'This reset link is invalid or has expired. Request a new one.',
  session_expired: 'Your session has expired. Please log in again.',
  invalid_otp: 'That code is wrong or has expired. Check it, or ask for a new one.',
}

function toServiceError(error, fallback) {
  if (error instanceof AuthServiceError) return error
  if (error instanceof ApiError) {
    if (error.status === 0) return new AuthServiceError('network', 'We could not reach the server. Check your connection and try again.')
    if (error.code === 'not_configured') return new AuthServiceError('not_configured', 'Authentication is not available right now.')
    if (error.fields?.username) return new AuthServiceError(error.code === 'username_taken' ? 'username_taken' : 'invalid_username', error.fields.username)
    if (error.fields?.current_password) return new AuthServiceError('invalid_credentials', 'Your current password is incorrect.')
    if (error.code === 'validation_error' && error.fields?.password) return new AuthServiceError('weak_password', typeof error.fields.password === 'string' ? error.fields.password : MESSAGES.weak_password) // the server says exactly what is wrong (too short, too similar to the username, too common…)
    if (error.status >= 500) return new AuthServiceError('server_busy', 'The server is starting up or busy. Please wait a minute and try again.')
    if (MESSAGES[error.code]) return new AuthServiceError(error.code, MESSAGES[error.code])
    if (error.code === 'unauthenticated') return new AuthServiceError('session_expired', MESSAGES.session_expired)
  }
  return new AuthServiceError('unknown', fallback)
}

const sessionOf = () => api.getSession() // { user } or null

// How the server delivers a new session: in an HttpOnly cookie, so no token ever reaches page script.
const SESSION_TRANSPORT = 'cookie'

// Resolves { needsConfirmation }. The API signs a new account in, so this is always false.
export async function signUp({ username, email, password }) {
  try {
    api.setSession(await api.post('/auth/register/', { username: username.trim(), email: email.trim(), password, transport: SESSION_TRANSPORT }))
  } catch (error) {
    throw toServiceError(error, 'We could not create your account. Please try again.')
  }
  return { needsConfirmation: false }
}

export async function signIn({ username, password }) {
  try {
    api.setSession(await api.post('/auth/login/', { username: username.trim(), password, transport: SESSION_TRANSPORT }))
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
    await api.post('/auth/password/reset/', { email: email.trim() })
  } catch (error) {
    throw toServiceError(error, 'We could not send the reset email. Please try again.')
  }
}

// Password reset with a code: the email gets a six-digit code (the API answers the same whether or not the address has an
// account), then the code is checked and, if right, the API hands back the one-time pass that lets a new password be set.
export async function requestResetCode(email) {
  try {
    await api.post('/auth/password/otp/request/', { email: email.trim() })
  } catch (error) {
    throw toServiceError(error, 'We could not send the code. Please try again.')
  }
}

export async function verifyResetCode({ email, code }) {
  try {
    return await api.post('/auth/password/otp/verify/', { email: email.trim(), code: code.trim() }) // { uid, token }
  } catch (error) {
    if (error instanceof ApiError && error.fields?.code) throw new AuthServiceError('invalid_otp', error.fields.code)
    throw toServiceError(error, 'We could not check the code. Please try again.')
  }
}

// `reset` ({ uid, token }) comes from the emailed link; a signed-in change needs the current password instead.
export async function updatePassword(password, { reset, currentPassword } = {}) {
  try {
    if (reset) await api.post('/auth/password/reset/confirm/', { uid: reset.uid, token: reset.token, password })
    else await api.post('/auth/password/change/', { current_password: currentPassword ?? '', password })
  } catch (error) {
    throw toServiceError(error, 'We could not update your password. Please try again.')
  }
}

// Changes the sign-in email. The server needs the password again. Updates who the app thinks is signed in.
export async function changeEmail({ email, password }) {
  try {
    const user = await api.post('/auth/email/change/', { email: email.trim(), password })
    api.setSession({ user })
  } catch (error) {
    if (error instanceof ApiError && error.fields?.password) throw new AuthServiceError('invalid_credentials', 'Your password is incorrect.')
    if (error instanceof ApiError && error.fields?.email) throw new AuthServiceError('email_taken', 'That email is already used by another account.')
    throw toServiceError(error, 'We could not change your email. Please try again.')
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

// Asks the server who the session cookie belongs to. Nobody is signed in locally until it answers: there is no stored
// copy to trust. Resolves { user }, or null if there is no valid session. If the server cannot be reached this rejects
// (the caller shows the signed-out state; reloading when the connection is back restores the session, the cookie is intact).
export async function getSession() {
  try {
    api.setSession({ user: await api.get('/auth/me/') })
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw toServiceError(error, 'We could not check your session.')
  }
  return sessionOf()
}

// Subscribes to sign-in / sign-out / expiry. Returns an unsubscribe function.
export function onAuthStateChange(callback) {
  return api.subscribe((event) => callback(event, sessionOf()))
}
