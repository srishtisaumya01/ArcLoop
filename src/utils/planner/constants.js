// Planner vocabulary and configuration. Pure data: no React, storage or network.
// Rules referenced here are specified in docs/DAILY_PLANNING_SPEC.md.

// D1: only these completion values exist.
export const COMPLETION = Object.freeze({ PENDING: 0, PARTIAL: 0.5, DONE: 1 })
export const COMPLETION_VALUES = Object.freeze([0, 0.5, 1])

export const DAY_MODES = Object.freeze({ NORMAL: 'normal', BUSY: 'busy', REST: 'rest' })
export const PLAN_STATES = Object.freeze({ ACTIVE: 'active', EXCLUDED: 'excluded' })
export const EXCLUDED_REASONS = Object.freeze({
  RESCHEDULED: 'rescheduled',
  BUSY_DAY: 'busy_day',
  REST_DAY: 'rest_day',
  REMOVED: 'removed',
})
export const RECURRENCE = Object.freeze({ ONCE: 'once', DAILY: 'daily', WEEKLY: 'weekly' })

// ISO weekday numbers: 1 = Monday ... 7 = Sunday.
export const MONDAY = 1

// Tunable values. Callers may pass a partial override (`config`) to any function
// that takes one; nothing below is read from a global at call time.
export const PLANNER_CONFIG = Object.freeze({
  // D5: editable window = today plus the previous 6 dates = 7 dates in total.
  pastEditWindowDates: 7,
  // PROVISIONAL: how far ahead a day can be planned. Not an approved product
  // decision; kept configurable on purpose (spec 11b).
  planAheadDays: 30,
  // D8: weeks start on Monday (ISO weekday 1).
  weekStartsOn: MONDAY,
  // Weekly summaries need at least this many days with a plan (DP-20).
  minPlannedDaysForWeeklySummary: 3,
  limits: Object.freeze({
    titleMax: 120,
    descriptionMax: 1000,
    categoryMax: 40,
    estimatedMinutesMax: 1440,
  }),
})
