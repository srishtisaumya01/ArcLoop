import { isValidTimeZone } from './planner/index.js'

// Profile helpers (pure, apart from reading the browser's own timezone through Intl). The timezone
// check is the planner's, so the app has one definition of a valid zone; the database trigger
// remains the authority.
export const DISPLAY_NAME_MAX = 60

// Browsers (Chrome especially) report some zones by their older names. The newer names are the ones
// people look for in a list, and the database accepts both.
const MODERN_NAMES = { 'Asia/Calcutta': 'Asia/Kolkata', 'Asia/Katmandu': 'Asia/Kathmandu', 'Asia/Saigon': 'Asia/Ho_Chi_Minh', 'Asia/Rangoon': 'Asia/Yangon', 'Europe/Kiev': 'Europe/Kyiv', 'Pacific/Truk': 'Pacific/Chuuk' }
const modern = (zone) => MODERN_NAMES[zone] ?? zone

// The timezone this device reports, or null when the browser cannot say or reports something the
// planner would not accept.
export function detectDeviceTimeZone(intl = Intl) {
  try {
    const zone = intl.DateTimeFormat().resolvedOptions().timeZone
    return isValidTimeZone(zone) ? modern(zone) : null
  } catch {
    return null
  }
}

// The zones offered in the picker: everything the browser knows, UTC, and the current/detected
// values even if the browser list omits them. Sorted, no duplicates.
export function timeZoneOptions({ current, device, intl = Intl } = {}) {
  const known = (() => {
    try {
      return typeof intl.supportedValuesOf === 'function' ? intl.supportedValuesOf('timeZone') : []
    } catch {
      return []
    }
  })()
  return [...new Set(['UTC', ...known.map(modern), current, device].filter((z) => typeof z === 'string' && isValidTimeZone(z)))].sort((a, b) => a.localeCompare(b))
}

// Partial update: only the fields that are present are validated and returned, so changing the
// timezone alone can never clear the display name (and vice versa).
export function validateProfileInput({ displayName, timezone } = {}) {
  const errors = {}
  const value = {}
  if (displayName !== undefined) {
    const name = typeof displayName === 'string' ? displayName.trim() : ''
    if (name.length > DISPLAY_NAME_MAX) errors.displayName = `Keep your name under ${DISPLAY_NAME_MAX} characters.`
    else value.display_name = name === '' ? null : name
  }
  if (timezone !== undefined) {
    if (isValidTimeZone(timezone)) value.timezone = timezone
    else errors.timezone = 'Choose a timezone from the list.'
  }
  if (Object.keys(value).length === 0 && Object.keys(errors).length === 0) errors.form = 'Nothing to save.'
  if (Object.keys(errors).length > 0) return { ok: false, value: null, errors }
  return { ok: true, value, errors }
}
