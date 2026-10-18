// Short, readable dates for the signed-in challenge screens ("1 Oct 2026"), in the chosen language.
export function formatDate(iso, lang = 'en') {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(y, m - 1, d))
}

// Today as "YYYY-MM-DD" on this device.
export function todayIso(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// The date `days` after `iso`, as "YYYY-MM-DD".
export function addDaysIso(iso, days) {
  const [y, m, d] = iso.split('-').map(Number)
  return todayIso(new Date(y, m - 1, d + days))
}
