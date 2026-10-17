import { PLANNER_CONFIG } from './constants.js'
import { ERR, PlannerError } from './errors.js'
import { addDays, compareDates } from './localDates.js'

// D5: only 7 dates are editable: today and the previous 6. Older days are
// preserved read-only and cannot be backfilled. The upper bound is the
// provisional planning-ahead limit.

export function editableRange(today, config = PLANNER_CONFIG) {
  return {
    earliest: addDays(today, -(config.pastEditWindowDates - 1)),
    latest: addDays(today, config.planAheadDays),
  }
}

// 'read_only_past' | 'editable_past' | 'today' | 'future' | 'beyond_plan_ahead'
export function classifyDate(date, today, config = PLANNER_CONFIG) {
  const { earliest, latest } = editableRange(today, config)
  if (compareDates(date, latest) > 0) return 'beyond_plan_ahead'
  const vsToday = compareDates(date, today)
  if (vsToday > 0) return 'future'
  if (vsToday === 0) return 'today'
  return compareDates(date, earliest) >= 0 ? 'editable_past' : 'read_only_past'
}

export function isEditableDate(date, today, config = PLANNER_CONFIG) {
  const kind = classifyDate(date, today, config)
  return kind === 'today' || kind === 'future' || kind === 'editable_past'
}

export function assertEditableDate(date, today, config = PLANNER_CONFIG) {
  const kind = classifyDate(date, today, config)
  if (kind === 'read_only_past') {
    throw new PlannerError(ERR.DATE_NOT_EDITABLE, `${date} is part of your history and is read-only.`, { date })
  }
  if (kind === 'beyond_plan_ahead') {
    throw new PlannerError(ERR.BEYOND_PLAN_AHEAD, `${date} is further ahead than you can plan.`, { date })
  }
}

// Progress can be recorded on any editable date up to and including today.
export function assertCanRecordProgress(date, today, config = PLANNER_CONFIG) {
  assertEditableDate(date, today, config)
  if (compareDates(date, today) > 0) {
    throw new PlannerError(ERR.FUTURE_DATE, 'Progress can only be recorded for today or earlier.', { date })
  }
}
