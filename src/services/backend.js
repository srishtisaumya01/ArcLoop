import { api, isApiConfigured } from './api/apiClient.js'
import { createDjangoClient } from './api/djangoClient.js'
import { isSupabaseConfigured, supabase } from './supabaseClient.js'

// Which backend this build talks to. The migration from Supabase to Django + SQLite is incremental, so both
// stay in the code until the Django path is proven; the build chooses one:
//   VITE_BACKEND=django   -> the Arcloop API at VITE_API_BASE_URL (see backend/README in the main README)
//   anything else         -> Supabase, as before
export const backend = import.meta.env.VITE_BACKEND === 'django' ? 'django' : 'supabase'
export const isDjango = backend === 'django'

// Whether the chosen backend has usable configuration. Screens use this to say "not available" instead of failing.
export const isBackendConfigured = isDjango ? isApiConfigured : isSupabaseConfigured

// The data client the planner and reminder services are wired to (null when the chosen backend is not configured).
export const dataClient = isDjango ? (isApiConfigured ? createDjangoClient(api) : null) : supabase
