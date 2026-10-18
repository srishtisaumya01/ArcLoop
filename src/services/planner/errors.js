import { ERR, PlannerError } from '../../utils/planner/index.js'

// Typed-by-convention errors for the planner services (plain JavaScript, no TypeScript):
// every failure is a PlannerServiceError whose `code` is one of SERVICE_ERROR.
// Messages are written for people and never contain SQL, table names, hints or
// credentials. The original error is kept on `cause` for logging only; do not display it.

export const SERVICE_ERROR = Object.freeze({
  VALIDATION: 'VALIDATION', // the input, or the planner's rules, do not allow this
  AUTH_REQUIRED: 'AUTH_REQUIRED', // no signed-in user (or the session is no longer valid)
  PERMISSION_DENIED: 'PERMISSION_DENIED', // the database refused (RLS / privileges)
  NOT_FOUND: 'NOT_FOUND', // missing, or not visible to this user (the two are indistinguishable by design)
  CONFLICT: 'CONFLICT', // duplicate or conflicting operation, or a state that blocks this action
  NETWORK: 'NETWORK', // could not reach the server; safe to retry
  NOT_CONFIGURED: 'NOT_CONFIGURED', // the API address is not configured in this build
  UNKNOWN: 'UNKNOWN', // anything else
})

export class PlannerServiceError extends Error {
  constructor(code, message, { details = {}, cause } = {}) {
    super(message)
    this.name = 'PlannerServiceError'
    this.code = code
    this.details = details
    this.retryable = code === SERVICE_ERROR.NETWORK
    // Non-enumerable on purpose: serialising an error (logs, telemetry, a UI dump) must not
    // emit the raw database error. It stays readable as `error.cause` for deliberate logging.
    if (cause !== undefined) Object.defineProperty(this, 'cause', { value: cause, enumerable: false, writable: true, configurable: true })
  }
}

// Pure-logic rule violations (src/utils/planner) -> service categories.
const VALIDATION_LOGIC = new Set([
  ERR.INVALID_DATE, ERR.INVALID_TIME, ERR.INVALID_TIME_ZONE, ERR.INVALID_INSTANT, ERR.INVALID_COMPLETION,
  ERR.INVALID_DAY_MODE, ERR.INVALID_TEMPLATE, ERR.INVALID_ARGUMENT, ERR.DATE_NOT_EDITABLE,
  ERR.BEYOND_PLAN_AHEAD, ERR.FUTURE_DATE, ERR.INVALID_RESCHEDULE_TARGET,
])
const CONFLICT_LOGIC = new Set([
  ERR.NOT_ACTIVE, ERR.NOT_EXCLUDED, ERR.HAS_PROGRESS, ERR.REQUIRES_UNDO_RESCHEDULE,
  ERR.ALREADY_PLANNED_ON_TARGET, ERR.INVALID_STATE,
])

const NETWORK_PATTERN = /failed to fetch|network|timeout|timed out|econn|enotfound|socket|aborted|load failed/i

// Data-client errors -> service categories. The API client maps the API's error codes onto the SQLSTATE-style
// codes below (see src/services/api/djangoClient.js), and network failures carry no code. Only the SQLSTATE
// code is kept in `details`; messages, details and hints from the database are dropped.
export function toServiceError(error) {
  if (error instanceof PlannerServiceError) return error

  if (error instanceof PlannerError) {
    const details = { plannerCode: error.code, ...error.details }
    if (VALIDATION_LOGIC.has(error.code)) return new PlannerServiceError(SERVICE_ERROR.VALIDATION, error.message, { details, cause: error })
    if (CONFLICT_LOGIC.has(error.code)) return new PlannerServiceError(SERVICE_ERROR.CONFLICT, error.message, { details, cause: error })
    return new PlannerServiceError(SERVICE_ERROR.UNKNOWN, 'Something went wrong. Please try again.', { details, cause: error })
  }

  const code = typeof error?.code === 'string' ? error.code : ''
  const message = typeof error?.message === 'string' ? error.message : ''
  const status = typeof error?.status === 'number' ? error.status : undefined
  const make = (serviceCode, text, extra = {}) =>
    new PlannerServiceError(serviceCode, text, { details: { dbCode: code || undefined, ...extra }, cause: error })

  if (code === '42501') return make(SERVICE_ERROR.PERMISSION_DENIED, 'You do not have permission to do that.')
  if (code === '23505') return make(SERVICE_ERROR.CONFLICT, 'That already exists.')
  if (code === '23503') return make(SERVICE_ERROR.NOT_FOUND, 'Something this refers to could not be found.')
  if (code === '23514') return make(SERVICE_ERROR.VALIDATION, 'That change is not allowed by the planner rules.')
  // Limits and date rules raised by our own triggers carry a curated, user-safe message.
  if (code === '22008' || code === '54000') return make(SERVICE_ERROR.VALIDATION, message || 'That is not allowed right now.', { reason: 'rule' })
  if (code === 'PGRST116') return make(SERVICE_ERROR.NOT_FOUND, 'That could not be found.')
  if (code === 'PGRST301' || code === 'PGRST302' || status === 401 || /jwt|not authenticated/i.test(message)) {
    return make(SERVICE_ERROR.AUTH_REQUIRED, 'Please log in again to continue.')
  }
  if (!code && (error?.name === 'TypeError' || error?.name === 'AbortError' || error?.name === 'AuthRetryableFetchError' || status === 0 || NETWORK_PATTERN.test(message))) {
    return make(SERVICE_ERROR.NETWORK, 'We could not reach the server. Check your connection and try again.')
  }
  return make(SERVICE_ERROR.UNKNOWN, 'Something went wrong. Please try again.')
}
