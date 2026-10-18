const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const MINUTE_MS = 60_000

// "2026-10-01" as midnight on that date in the visitor's own time zone (new Date('2026-10-01') would be UTC).
export function parseLocalDate(iso) {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * Where a challenge stands right now. The first day is day 1, so a challenge that began on 1 October is on day 18 on
 * 18 October. The countdown runs to midnight at the end of the last day (or to the start, before it begins).
 */
export function challengeClock({ startDate, totalDays }, now = new Date()) {
  const start = parseLocalDate(startDate)
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + totalDays)
  const lastDay = new Date(start.getFullYear(), start.getMonth(), start.getDate() + totalDays - 1)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const status = now < start ? 'upcoming' : now >= end ? 'ended' : 'live'
  const dayNumber = status === 'live' ? Math.round((today - start) / DAY_MS) + 1 : status === 'ended' ? totalDays : 0
  const daysLeft = status === 'live' ? totalDays - dayNumber : status === 'upcoming' ? totalDays : 0

  const remaining = Math.max(0, (status === 'upcoming' ? start : end) - now)
  return {
    status,
    dayNumber,
    totalDays,
    daysLeft,
    start,
    lastDay,
    progress: totalDays ? dayNumber / totalDays : 0,
    parts: {
      days: Math.floor(remaining / DAY_MS),
      hours: Math.floor((remaining % DAY_MS) / HOUR_MS),
      minutes: Math.floor((remaining % HOUR_MS) / MINUTE_MS),
      seconds: Math.floor((remaining % MINUTE_MS) / 1000),
    },
  }
}
