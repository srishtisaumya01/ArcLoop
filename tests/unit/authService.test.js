import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ supabase: null }))
vi.mock('../../src/services/supabaseClient.js', () => ({
  get supabase() {
    return h.supabase
  },
  isSupabaseConfigured: true,
}))

import {
  AuthServiceError,
  onAuthStateChange,
  requestPasswordReset,
  signIn,
  signOut,
  signUp,
  updatePassword,
} from '../../src/services/authService.js'

function fakeClient(overrides = {}) {
  return {
    auth: {
      signUp: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      ...overrides,
    },
  }
}

beforeEach(() => {
  h.supabase = fakeClient()
})

const failWith = (error) => ({ error })

describe('authService', () => {
  it('signUp trims the email, sets the confirmation redirect, and reports whether confirmation is needed', async () => {
    const result = await signUp({ email: '  a@example.com ', password: 'longenough' })
    expect(result).toEqual({ needsConfirmation: true })
    expect(h.supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'a@example.com',
      password: 'longenough',
      options: { emailRedirectTo: `${window.location.origin}/app` },
    })

    h.supabase = fakeClient({ signUp: vi.fn().mockResolvedValue({ data: { session: { user: {} } }, error: null }) })
    expect(await signUp({ email: 'a@example.com', password: 'longenough' })).toEqual({ needsConfirmation: false })
  })

  it('maps provider errors to friendly messages without leaking the raw message', async () => {
    h.supabase = fakeClient({
      signInWithPassword: vi.fn().mockResolvedValue(failWith({ code: 'invalid_credentials', message: 'Invalid login credentials' })),
    })
    await expect(signIn({ email: 'a@b.co', password: 'x' })).rejects.toMatchObject({
      code: 'invalid_credentials',
      message: 'Email or password is incorrect.',
    })

    h.supabase = fakeClient({
      signInWithPassword: vi.fn().mockResolvedValue(failWith({ code: 'email_not_confirmed', message: 'raw' })),
    })
    await expect(signIn({ email: 'a@b.co', password: 'x' })).rejects.toThrow(/confirm your email/i)
  })

  it('maps rate limits, network failures and unknown errors', async () => {
    h.supabase = fakeClient({ signInWithPassword: vi.fn().mockResolvedValue(failWith({ status: 429, message: 'raw' })) })
    await expect(signIn({ email: 'a@b.co', password: 'x' })).rejects.toThrow(/too many attempts/i)

    h.supabase = fakeClient({ signInWithPassword: vi.fn().mockResolvedValue(failWith({ name: 'AuthRetryableFetchError', status: 0, message: 'raw' })) })
    await expect(signIn({ email: 'a@b.co', password: 'x' })).rejects.toThrow(/could not reach the server/i)

    h.supabase = fakeClient({ signInWithPassword: vi.fn().mockResolvedValue(failWith({ code: 'something_new', message: 'db exploded at host 10.0.0.5' })) })
    const err = await signIn({ email: 'a@b.co', password: 'x' }).catch((e) => e)
    expect(err).toBeInstanceOf(AuthServiceError)
    expect(err.message).not.toMatch(/10\.0\.0\.5/)
  })

  it('requests password reset with the update-password redirect', async () => {
    await requestPasswordReset(' who@example.com ')
    expect(h.supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('who@example.com', {
      redirectTo: `${window.location.origin}/update-password`,
    })
  })

  it('updatePassword maps same_password and weak_password', async () => {
    h.supabase = fakeClient({ updateUser: vi.fn().mockResolvedValue(failWith({ code: 'same_password', message: 'raw' })) })
    await expect(updatePassword('x')).rejects.toThrow(/not used before/i)
    h.supabase = fakeClient({ updateUser: vi.fn().mockResolvedValue(failWith({ code: 'weak_password', message: 'raw' })) })
    await expect(updatePassword('x')).rejects.toThrow(/too easy to guess/i)
  })

  it('signOut ends only this device’s session', async () => {
    await signOut()
    expect(h.supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('onAuthStateChange returns a working unsubscribe', () => {
    const unsubscribe = vi.fn()
    h.supabase = fakeClient({ onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe } } }) })
    const stop = onAuthStateChange(() => {})
    stop()
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('refuses to run, with a clear code, when Supabase is not configured', async () => {
    h.supabase = null
    await expect(signIn({ email: 'a@b.co', password: 'x' })).rejects.toMatchObject({ code: 'not_configured' })
    await expect(signUp({ email: 'a@b.co', password: 'x' })).rejects.toMatchObject({ code: 'not_configured' })
    expect(onAuthStateChange(() => {})).toBeTypeOf('function')
  })
})
