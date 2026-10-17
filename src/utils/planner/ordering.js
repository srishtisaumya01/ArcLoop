import { parseTime } from './localDates.js'

const text = (v) => (typeof v === 'string' ? v : '')

// Chronological display order (spec 3B): timed tasks first by start time (then
// end time, earlier ends first, open-ended last), then untimed tasks in the order
// they were created. Ties fall back to title then id, so the order is deterministic.
// Returns a new array; the input is not modified.
export function sortOccurrencesForDisplay(occurrences) {
  const key = (o) => ({
    timed: o.plannedStart ? 0 : 1,
    start: o.plannedStart ? parseTime(o.plannedStart) : 0,
    end: o.plannedEnd ? parseTime(o.plannedEnd) : Number.POSITIVE_INFINITY,
  })
  return [...occurrences].sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    if (ka.timed !== kb.timed) return ka.timed - kb.timed
    if (ka.start !== kb.start) return ka.start - kb.start
    if (ka.end !== kb.end) return ka.end < kb.end ? -1 : 1
    const created = text(a.createdAt).localeCompare(text(b.createdAt))
    if (created !== 0) return created
    const title = text(a.title).localeCompare(text(b.title))
    if (title !== 0) return title
    return text(a.id).localeCompare(text(b.id))
  })
}
