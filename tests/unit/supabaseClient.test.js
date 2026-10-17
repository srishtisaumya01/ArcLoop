import { afterEach, describe, expect, it, vi } from 'vitest'

async function load(env) {
  vi.resetModules()
  vi.unstubAllEnvs()
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
  return import('../../src/services/supabaseClient.js')
}

afterEach(() => vi.unstubAllEnvs())

describe('supabaseClient configuration', () => {
  it('is unconfigured when nothing is set', async () => {
    const m = await load({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' })
    expect(m.isSupabaseConfigured).toBe(false)
    expect(m.supabase).toBeNull()
  })

  it('treats the .env.example placeholders as unconfigured', async () => {
    const m = await load({
      VITE_SUPABASE_URL: 'https://your-project-ref.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'your-public-anon-or-publishable-key',
    })
    expect(m.isSupabaseConfigured).toBe(false)
    expect(m.supabase).toBeNull()
  })

  it('rejects a URL that is not http(s)', async () => {
    const m = await load({ VITE_SUPABASE_URL: 'abcdefgh.supabase.co', VITE_SUPABASE_ANON_KEY: 'sb_publishable_test' })
    expect(m.isSupabaseConfigured).toBe(false)
  })

  it('creates a client when both values look real (no network call is made on creation)', async () => {
    const m = await load({ VITE_SUPABASE_URL: 'https://abcdefgh.supabase.co', VITE_SUPABASE_ANON_KEY: 'sb_publishable_test' })
    expect(m.isSupabaseConfigured).toBe(true)
    expect(m.supabase).not.toBeNull()
    expect(typeof m.supabase.auth.signInWithPassword).toBe('function')
  })
})
