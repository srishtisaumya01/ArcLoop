import { sortOccurrencesForDisplay } from './ordering.js'
import { addedAfterBaseline, currentOccurrences, originalOccurrences, setAsideOccurrences, summarizeDay } from './progress.js'

export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) deepFreeze(value[key])
  }
  return value
}

// Occurrences and days are plain JSON-safe data, so a JSON round trip is a faithful deep copy.
const clone = (value) => JSON.parse(JSON.stringify(value))

// An immutable, deterministic view of one day for history and "plan vs revised"
// displays. It is a deep copy, frozen, so later changes to the live data (or an
// attempt to edit the snapshot) cannot alter what was captured.
//   original            every task that was in the plan at the baseline, whatever its state now
//   current             tasks in today's (revised) plan
//   setAside            tasks set aside, moved or removed, with their reasons
//   addedAfterBaseline  tasks added after the baseline (count only in `current`)
export function buildPlanSnapshot({ day, occurrences }) {
  const frozenDay = clone(day)
  const all = sortOccurrencesForDisplay(clone(occurrences))
  const summary = summarizeDay({ day: frozenDay, occurrences: all })
  return deepFreeze({
    planDate: frozenDay.planDate,
    dayMode: frozenDay.dayMode,
    isRestDay: summary.isRestDay,
    kind: summary.kind,
    revised: summary.revised,
    baselineAt: frozenDay.baselineAt,
    original: originalOccurrences(all),
    current: currentOccurrences(all),
    setAside: setAsideOccurrences(all),
    addedAfterBaseline: addedAfterBaseline(all),
    progress: { current: summary.current, original: summary.original },
  })
}
