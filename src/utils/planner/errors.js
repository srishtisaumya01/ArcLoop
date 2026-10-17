// Error codes thrown by planner functions when a caller breaks a rule or passes
// invalid input. Field-level form validation returns messages instead (see templates.js).
export const ERR = Object.freeze({
  INVALID_DATE: 'INVALID_DATE',
  INVALID_TIME: 'INVALID_TIME',
  INVALID_TIME_ZONE: 'INVALID_TIME_ZONE',
  INVALID_INSTANT: 'INVALID_INSTANT',
  INVALID_COMPLETION: 'INVALID_COMPLETION',
  INVALID_DAY_MODE: 'INVALID_DAY_MODE',
  INVALID_TEMPLATE: 'INVALID_TEMPLATE',
  INVALID_STATE: 'INVALID_STATE',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  DATE_NOT_EDITABLE: 'DATE_NOT_EDITABLE', // older than the 7-date window (D5)
  BEYOND_PLAN_AHEAD: 'BEYOND_PLAN_AHEAD', // further ahead than the planning limit
  FUTURE_DATE: 'FUTURE_DATE', // progress cannot be recorded for a future date
  NOT_ACTIVE: 'NOT_ACTIVE',
  NOT_EXCLUDED: 'NOT_EXCLUDED',
  HAS_PROGRESS: 'HAS_PROGRESS', // a done (1.0) task cannot be set aside or removed
  REQUIRES_UNDO_RESCHEDULE: 'REQUIRES_UNDO_RESCHEDULE',
  ALREADY_PLANNED_ON_TARGET: 'ALREADY_PLANNED_ON_TARGET',
  INVALID_RESCHEDULE_TARGET: 'INVALID_RESCHEDULE_TARGET',
})

export class PlannerError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'PlannerError'
    this.code = code
    this.details = details
  }
}
