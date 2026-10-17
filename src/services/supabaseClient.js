import { createClient } from '@supabase/supabase-js'

// The ONLY place the Supabase client is created. Only the public project URL
// and anon/publishable key belong here. Never put a service-role key or
// database password in a VITE_ variable: everything VITE_ is shipped to the browser.
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Values copied straight from .env.example are not real configuration.
const isPlaceholder = (value) => /your-/i.test(value)

export const isSupabaseConfigured = Boolean(
  url && anonKey && /^https?:\/\//.test(url) && !isPlaceholder(url) && !isPlaceholder(anonKey),
)

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
