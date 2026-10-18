import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../src/services/api/apiClient.js'

// The API client is replaced by a recording fake; the service under test is the real one.
const h = vi.hoisted(() => ({ api: null }))
vi.mock('../../src/services/api/apiClient.js', async (importOriginal) => ({
  ...(await importOriginal()),
  api: new Proxy({}, { get: (_, key) => h.api[key] }),
}))

import {
  AuthServiceError,
  deleteAccount,
  getSession,
  onAuthStateChange,
  requestPasswordReset,
  signIn,
  signOut,
  signUp,
  updatePassword,
} from '../../src/services/authService.js'

const apiError = (status, code, message = 'raw server message', fields) => new ApiError({ status, code, message, fields })
const session = { token: 'tok', expiresAt: '2999-01-01T00:00:00Z', user: { id: 7, email: 'a@example.com' } }
const payload = { token: 'tok', expires_at: '2999-01-01T00:00:00Z', user: { id: 7, email: 'a@example.com' } }

function fakeApi(overrides = {}) {
  let current = null
  return {
    post: vi.fn().mockResolvedValue(payload),
    get: vi.fn().mockResolvedValue({}),
    setSession: vi.fn((p) => {
      current = { ...session, token: p.token }
    }),
    clearSession: vi.fn(() => {
      current = null
    }),
    getSession: vi.fn(() => current),
    subscribe: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  }
}

beforeEach(() => {
  h.api = fakeApi()
})

describe('authService', () => {
  it('signUp trims the email, stores the session the API returns, and never asks for confirmation', async () => {
    const result = await signUp({ email: '  a@example.com ', password: 'longenough' })
    expect(result).toEqual({ needsConfirmation: false })
    expect(h.api.post).toHaveBeenCalledWith('/auth/register/', { email: 'a@example.com', password: 'longenough' }, { authenticated: false })
    expect(h.api.setSession).toHaveBeenCalledWith(payload)
  })

  it('signIn trims the email and stores the session', async () => {
    await signIn({ email: ' a@example.com ', password: 'x' })
    expect(h.api.post).toHaveBeenCalledWith('/auth/login/', { email: 'a@example.com', password: 'x' }, { authenticated: false })
    expect(h.api.setSession).toHaveBeenCalled()
  })

  it('maps server errors to friendly messages without leaking the raw message', async () => {
    const cases = [
      [apiError(401, 'invalid_credentials'), 'invalid_credentials', /email or password is incorrect/i],
      [apiError(429, 'rate_limited'), 'rate_limited', /too many attempts/i],
      [apiError(400, 'email_taken'), 'email_taken', /account may already exist/i],
      [apiError(400, 'validation_error', 'raw', { password: 'bad' }), 'weak_password', /too easy to guess/i],
      [apiError(0, undefined, 'Failed to fetch'), 'network', /could not reach the server/i],
      [apiError(0, 'not_configured'), 'network', /could not reach the server/i],
    ]
    for (const [failure, code, message] of cases) {
      h.api = fakeApi({ post: vi.fn().mockRejectedValue(failure) })
      const error = await signIn({ email: 'a@b.co', password: 'x' }).catch((e) => e)
      expect(error).toBeInstanceOf(AuthServiceError)
      expect(error.code).toBe(code)
      expect(error.message).toMatch(message)
      expect(error.message).not.toMatch(/raw server message|Failed to fetch/)
    }
    h.api = fakeApi({ post: vi.fn().mockRejectedValue(new ApiError({ status: 500, code: 'server_error', message: 'db exploded at host 10.0.0.5' })) })
    const unknown = await signIn({ email: 'a@b.co', password: 'x' }).catch((e) => e)
    expect(unknown.code).toBe('unknown')
    expect(unknown.message).not.toMatch(/10\.0\.0\.5/)
  })

  it('requests a password reset without credentials, trimming the email', async () => {
    await requestPasswordReset(' who@example.com ')
    expect(h.api.post).toHaveBeenCalledWith('/auth/password/reset/', { email: 'who@example.com' }, { authenticated: false })
  })

  it('updatePassword uses the emailed link’s uid and token, or the current password when signed in', async () => {
    await updatePassword('new-pass-1', { reset: { uid: 'MQ', token: 'abc-123' } })
    expect(h.api.post).toHaveBeenLastCalledWith('/auth/password/reset/confirm/', { uid: 'MQ', token: 'abc-123', password: 'new-pass-1' }, { authenticated: false })
    await updatePassword('new-pass-1', { currentPassword: 'old-pass-1' })
    expect(h.api.post).toHaveBeenLastCalledWith('/auth/password/change/', { current_password: 'old-pass-1', password: 'new-pass-1' })
  })

  it('updatePassword explains a wrong current password, a weak password and a dead reset link', async () => {
    h.api = fakeApi({ post: vi.fn().mockRejectedValue(apiError(400, 'invalid_credentials', 'raw', { current_password: 'x' })) })
    await expect(updatePassword('x', { currentPassword: 'y' })).rejects.toThrow(/current password is incorrect/i)
    h.api = fakeApi({ post: vi.fn().mockRejectedValue(apiError(400, 'weak_password')) })
    await expect(updatePassword('x', { currentPassword: 'y' })).rejects.toThrow(/too easy to guess/i)
    h.api = fakeApi({ post: vi.fn().mockRejectedValue(apiError(400, 'invalid_reset_link')) })
    await expect(updatePassword('x', { reset: { uid: 'a', token: 'b' } })).rejects.toThrow(/invalid or has expired/i)
  })

  it('signOut ends this device’s session and clears it locally even when the server call fails', async () => {
    await signOut()
    expect(h.api.post).toHaveBeenCalledWith('/auth/logout/')
    expect(h.api.clearSession).toHaveBeenCalled()

    h.api = fakeApi({ post: vi.fn().mockRejectedValue(new ApiError({ status: 0, message: 'offline' })) })
    await expect(signOut()).rejects.toMatchObject({ code: 'network' })
    expect(h.api.clearSession).toHaveBeenCalled() // signed out on this device anyway

    h.api = fakeApi({ post: vi.fn().mockRejectedValue(apiError(401, 'unauthenticated')) })
    await expect(signOut()).resolves.toBeUndefined() // the server already forgot it: nothing to report
  })

  it('deleteAccount sends the password and confirmation, clears the session, and explains refusals', async () => {
    await deleteAccount({ password: 'pw-1', confirmation: 'DELETE' })
    expect(h.api.post).toHaveBeenCalledWith('/auth/account/delete/', { password: 'pw-1', confirmation: 'DELETE' })
    expect(h.api.clearSession).toHaveBeenCalled()

    h.api = fakeApi({ post: vi.fn().mockRejectedValue(apiError(400, 'invalid_credentials', 'raw', { password: 'x' })) })
    await expect(deleteAccount({ password: 'bad', confirmation: 'DELETE' })).rejects.toThrow('Your password is incorrect.')
    expect(h.api.clearSession).not.toHaveBeenCalled() // a refusal must not sign anyone out
    h.api = fakeApi({ post: vi.fn().mockRejectedValue(apiError(400, 'confirmation_required', 'raw', { confirmation: 'x' })) })
    await expect(deleteAccount({ password: 'pw', confirmation: 'nope' })).rejects.toThrow('Type DELETE to confirm.')
  })

  it('getSession restores a stored session only if the server still accepts it, and survives a brief outage', async () => {
    expect(await getSession()).toBeNull() // nothing stored: the server is not even asked
    expect(h.api.get).not.toHaveBeenCalled()

    h.api = fakeApi({ getSession: vi.fn(() => session) })
    expect(await getSession()).toEqual({ user: session.user })
    expect(h.api.get).toHaveBeenCalledWith('/auth/me/')

    h.api = fakeApi({ getSession: vi.fn(() => session), get: vi.fn().mockRejectedValue(apiError(401, 'unauthenticated')) })
    expect(await getSession()).toBeNull()

    h.api = fakeApi({ getSession: vi.fn(() => session), get: vi.fn().mockRejectedValue(new ApiError({ status: 0, message: 'offline' })) })
    expect(await getSession()).toEqual({ user: session.user }) // kept: an outage is not a sign-out
  })

  it('onAuthStateChange passes events with the current session and returns a working unsubscribe', () => {
    const unsubscribe = vi.fn()
    let listener
    h.api = fakeApi({
      getSession: vi.fn(() => session),
      subscribe: vi.fn((fn) => {
        listener = fn
        return unsubscribe
      }),
    })
    const seen = vi.fn()
    const stop = onAuthStateChange(seen)
    listener('SIGNED_IN')
    expect(seen).toHaveBeenCalledWith('SIGNED_IN', { user: session.user })
    stop()
    expect(unsubscribe).toHaveBeenCalled()
  })
})
