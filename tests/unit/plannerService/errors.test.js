import { describe, expect, it } from 'vitest'
import { ERR, PlannerError } from '../../../src/utils/planner/index.js'
import { PlannerServiceError, SERVICE_ERROR, toServiceError } from '../../../src/services/planner/errors.js'

const db = (code, message = 'relation "task_occurrences" violates something at column secret_col', extra = {}) => ({ code, message, details: 'Key (user_id)=(…) is private', hint: 'hint text', ...extra })

describe('database errors map to service categories', () => {
  it.each([
    ['42501', SERVICE_ERROR.PERMISSION_DENIED],
    ['23505', SERVICE_ERROR.CONFLICT],
    ['23503', SERVICE_ERROR.NOT_FOUND],
    ['23514', SERVICE_ERROR.VALIDATION],
    ['22008', SERVICE_ERROR.VALIDATION],
    ['54000', SERVICE_ERROR.VALIDATION],
    ['PGRST116', SERVICE_ERROR.NOT_FOUND],
    ['PGRST301', SERVICE_ERROR.AUTH_REQUIRED],
    ['PGRST302', SERVICE_ERROR.AUTH_REQUIRED],
    ['XX000', SERVICE_ERROR.UNKNOWN],
    ['42P01', SERVICE_ERROR.UNKNOWN],
  ])('%s -> %s', (code, expected) => {
    expect(toServiceError(db(code)).code).toBe(expected)
  })

  it('treats a 401 or a JWT message as an authentication problem', () => {
    expect(toServiceError({ status: 401, message: 'x' }).code).toBe(SERVICE_ERROR.AUTH_REQUIRED)
    expect(toServiceError({ message: 'JWT expired' }).code).toBe(SERVICE_ERROR.AUTH_REQUIRED)
  })

  it('never leaks database wording: only the SQLSTATE survives, in details', () => {
    for (const code of ['42501', '23505', '23503', '23514', 'XX000', '42P01', 'PGRST116']) {
      const e = toServiceError(db(code))
      expect(JSON.stringify([e.message, e.details])).not.toMatch(/task_occurrences|secret_col|private|hint text|Key \(/)
      expect(Object.keys(e.details).sort()).toEqual(['dbCode'])
    }
  })

  it('passes through the curated message of our own trigger rules (limits and date rules)', () => {
    expect(toServiceError(db('22008', 'Progress can only be recorded for today or earlier.')).message).toBe('Progress can only be recorded for today or earlier.')
    expect(toServiceError(db('54000', 'Too many tasks on one day (limit 100).')).message).toMatch(/Too many tasks/)
    expect(toServiceError(db('22008', '')).message).toBeTruthy()
  })

  it('keeps the original error on `cause` for logging only', () => {
    const original = db('42501')
    expect(toServiceError(original).cause).toBe(original)
  })
})

describe('network failures', () => {
  it('are recognised and marked retryable', () => {
    for (const e of [new TypeError('Failed to fetch'), { message: 'TypeError: Failed to fetch' }, { message: 'network request failed' }, { message: 'timeout of 5000ms exceeded' }, { message: 'ECONNRESET' }, { name: 'AbortError', message: 'aborted' }, { name: 'AuthRetryableFetchError', message: 'x' }, { status: 0, message: '' }]) {
      const out = toServiceError(e)
      expect(out.code, JSON.stringify(e)).toBe(SERVICE_ERROR.NETWORK)
      expect(out.retryable).toBe(true)
    }
  })

  it('are not guessed when the database returned a real error code', () => {
    const out = toServiceError({ code: 'XX000', message: 'connection timeout inside the database' })
    expect(out.code).toBe(SERVICE_ERROR.UNKNOWN)
    expect(out.retryable).toBe(false)
  })

  it('other categories are not retryable', () => {
    for (const code of ['42501', '23505', 'PGRST116', 'XX000']) expect(toServiceError(db(code)).retryable).toBe(false)
  })
})

describe('pure planner rule violations', () => {
  it.each([
    [ERR.INVALID_COMPLETION, SERVICE_ERROR.VALIDATION],
    [ERR.INVALID_DATE, SERVICE_ERROR.VALIDATION],
    [ERR.DATE_NOT_EDITABLE, SERVICE_ERROR.VALIDATION],
    [ERR.FUTURE_DATE, SERVICE_ERROR.VALIDATION],
    [ERR.BEYOND_PLAN_AHEAD, SERVICE_ERROR.VALIDATION],
    [ERR.INVALID_RESCHEDULE_TARGET, SERVICE_ERROR.VALIDATION],
    [ERR.INVALID_TEMPLATE, SERVICE_ERROR.VALIDATION],
    [ERR.HAS_PROGRESS, SERVICE_ERROR.CONFLICT],
    [ERR.NOT_ACTIVE, SERVICE_ERROR.CONFLICT],
    [ERR.NOT_EXCLUDED, SERVICE_ERROR.CONFLICT],
    [ERR.REQUIRES_UNDO_RESCHEDULE, SERVICE_ERROR.CONFLICT],
    [ERR.ALREADY_PLANNED_ON_TARGET, SERVICE_ERROR.CONFLICT],
    [ERR.INVALID_STATE, SERVICE_ERROR.CONFLICT],
  ])('%s -> %s', (plannerCode, expected) => {
    const out = toServiceError(new PlannerError(plannerCode, 'A calm, user-safe message.', { date: '2026-03-03' }))
    expect(out.code).toBe(expected)
    expect(out.message).toBe('A calm, user-safe message.')
    expect(out.details).toMatchObject({ plannerCode, date: '2026-03-03' })
  })
})

describe('everything else', () => {
  it('returns an existing PlannerServiceError untouched', () => {
    const e = new PlannerServiceError(SERVICE_ERROR.CONFLICT, 'x')
    expect(toServiceError(e)).toBe(e)
  })

  it('turns odd throwables into a generic UNKNOWN error', () => {
    for (const odd of [null, undefined, 'boom', 42, {}, new Error('plain failure with SQL select * from secrets')]) {
      const out = toServiceError(odd)
      expect(out).toBeInstanceOf(PlannerServiceError)
      expect(out.code).toBe(SERVICE_ERROR.UNKNOWN)
      expect(out.message).toBe('Something went wrong. Please try again.')
    }
  })

  it('PlannerServiceError is an Error with a stable name, code and details', () => {
    const e = new PlannerServiceError(SERVICE_ERROR.VALIDATION, 'bad', { details: { fields: { title: 'x' } } })
    expect(e).toBeInstanceOf(Error)
    expect(e).toMatchObject({ name: 'PlannerServiceError', code: 'VALIDATION', retryable: false, details: { fields: { title: 'x' } } })
  })
})
