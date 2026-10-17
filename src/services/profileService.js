import { supabase } from './supabaseClient.js'

// Reads go through RLS: the database only ever returns the caller's own row.
// The `id` filter is for clarity, not security.
export async function getMyProfile(userId) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, timezone, interests, profile_visibility, progress_visibility, created_at')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}
