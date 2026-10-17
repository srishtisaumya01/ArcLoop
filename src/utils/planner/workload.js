import { resolveContext } from './context.js'
import { remainingOccurrences } from './progress.js'
import { hasLocalTimePassed, minutesUntilEndOfLocalDay } from './timeZones.js'

const usableEstimate = (minutes) => Number.isInteger(minutes) && minutes > 0

// Remaining effort for one day (spec 5.5). Deliberately modest: it reports facts and a
// hedged comparison, never a prediction.
//  - A partially completed task counts at its FULL estimated duration, because the
//    user has not said how much is left.
//  - Tasks without a usable estimate are counted in `missingEstimateCount` and the
//    comparison is withheld (`fitStatus: 'unknown'`) rather than guessed.
//  - Time left is real elapsed time to the next local midnight, so 23- and 25-hour
//    days are handled. It only applies to today.
// fitStatus: 'fits' | 'exceeds' | 'unknown' | 'nothing_remaining' | 'not_today'
export function estimateWorkload({ planDate, occurrences }, rawContext) {
  const ctx = resolveContext(rawContext)
  const remaining = remainingOccurrences(occurrences.filter((o) => o.planDate === planDate))
  const isToday = planDate === ctx.today

  const withEstimate = remaining.filter((o) => usableEstimate(o.estimatedMinutes))
  const totalEstimatedMinutes = withEstimate.reduce((sum, o) => sum + o.estimatedMinutes, 0)
  const missingEstimateCount = remaining.length - withEstimate.length
  const availableMinutes = isToday ? minutesUntilEndOfLocalDay(ctx.nowMs, ctx.timeZone) : null

  let fitStatus
  if (remaining.length === 0) fitStatus = 'nothing_remaining'
  else if (!isToday) fitStatus = 'not_today'
  else if (missingEstimateCount > 0) fitStatus = 'unknown'
  else fitStatus = totalEstimatedMinutes <= availableMinutes ? 'fits' : 'exceeds'

  // Tasks whose planned start has already passed: candidates to offer rescheduling
  // or shortening (offered, never imposed). Today only.
  const startTimePassedIds = isToday
    ? remaining.filter((o) => o.plannedStart && hasLocalTimePassed(ctx.nowMs, planDate, o.plannedStart, ctx.timeZone)).map((o) => o.id)
    : []

  return {
    remainingCount: remaining.length,
    priorityRemainingCount: remaining.filter((o) => o.isPriority).length,
    totalEstimatedMinutes,
    missingEstimateCount,
    availableMinutes,
    fitStatus,
    startTimePassedIds,
  }
}
