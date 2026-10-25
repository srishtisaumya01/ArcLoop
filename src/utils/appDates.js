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

const pad2 = (n) => String(n).padStart(2, '0')
// The first day of the month `n` months after the month of `iso`.
export function addMonthsIso(iso, n) {
  const [y, m] = iso.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-01`
}
// The last day of the month of `iso`.
export function endOfMonthIso(iso) {
  const [y, m] = iso.split('-').map(Number)
  const d = new Date(Date.UTC(y, m, 0))
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}
