// "Good morning" from 5:00 to 11:59, "Good afternoon" from 12:00 to 16:59, and "Good evening" from 17:00 through the night.
export function greetingFor(date = new Date()) {
  const hour = date.getHours()
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  return 'Good evening'
}

// The name to greet someone by: the display name from their profile, else their username, else the part of their email before the "@",
// with dots, dashes and underscores turned into spaces and each word capitalised ("ada.lovelace@x.com" is "Ada Lovelace").
export function nameFor({ displayName, username, email } = {}) {
  const chosen = (displayName ?? '').trim() || (username ?? '').trim()
  if (chosen) return chosen
  const local = (email ?? '').split('@')[0].replace(/[._-]+/g, ' ').trim()
  if (!local) return ''
  return local.replace(/\b\p{L}/gu, (c) => c.toUpperCase())
}

// The first word of a name, for a short greeting ("Good evening, Ada").
export const firstNameOf = (name) => name.trim().split(/\s+/)[0] ?? ''

// One or two capital letters for an avatar.
export function initialsOf(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}
