import { supabase } from './supabaseClient.js'
import { validateProfileInput } from '../utils/profile.js'

// Reads go through RLS: the database only ever returns the caller's own row.
// The `id` filter is for clarity, not security.
const PROFILE_COLUMNS = 'id, display_name, timezone, interests, profile_visibility, progress_visibility, created_at'

export async function getMyProfile(userId) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle()
  if (error) throw error
  return data
}

// Just the timezone, for the prompt that offers to fix a default of UTC.
export async function getMyTimezone() {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.from('profiles').select('timezone').maybeSingle()
  if (error) throw error
  return data?.timezone ?? null
}

// Saves the display name and/or timezone that are passed (others are left alone). Input is checked first with the shared rules; the database
// (RLS, column grants, timezone trigger) is still the authority. Failures carry user-safe messages
// and, where they belong to one field, `error.fields`.
export async function updateMyProfile(userId, changes) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const checked = validateProfileInput(changes)
  if (!checked.ok) throw Object.assign(new Error('Please check the highlighted details.'), { fields: checked.errors })
  let data
  let error
  try {
    ;({ data, error } = await supabase.from('profiles').update(checked.value).eq('id', userId).select(PROFILE_COLUMNS))
  } catch {
    error = {} // a thrown failure (network) is reported like any other: with a safe message
  }
  if (error) {
    if (error.code === '22023') throw Object.assign(new Error('That timezone isn’t recognised.'), { fields: { timezone: 'That timezone isn’t recognised. Choose another.' } })
    if (error.code === '23514') throw Object.assign(new Error('Please check the highlighted details.'), { fields: { displayName: 'Keep your name between 1 and 60 characters.' } })
    throw new Error('We couldn’t save your profile. Please try again.')
  }
  if (!data || data.length !== 1) throw new Error('Your profile could not be found.')
  return data[0]
}
