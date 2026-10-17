import { deepFreeze } from '../../../src/utils/planner/index.js'

// Fixed clock for every planner test: Tuesday 2026-03-10 11:00 in New York (EDT).
// Nothing here reads the real clock or depends on the machine's timezone.
export const TZ = 'America/New_York'
export const NOW = '2026-03-10T15:00:00Z'
export const TODAY = '2026-03-10'
export const ctx = (overrides = {}) => ({ now: NOW, timeZone: TZ, ...overrides })

let counter = 0

export function makeTemplate(overrides = {}) {
  return {
    id: 't1',
    title: 'Walk',
    description: null,
    category: null,
    isPriority: false,
    plannedStart: null,
    plannedEnd: null,
    estimatedMinutes: null,
    recurrence: 'daily',
    weekdays: null,
    startsOn: '2026-01-01',
    endsOn: null,
    ...overrides,
  }
}

export function makeOcc(overrides = {}) {
  counter += 1
  return {
    id: `o${counter}`,
    templateId: null,
    planDate: TODAY,
    title: `Task ${counter}`,
    description: null,
    category: null,
    isPriority: false,
    plannedStart: null,
    plannedEnd: null,
    estimatedMinutes: null,
    completion: 0,
    completedAt: null,
    planState: 'active',
    excludedReason: null,
    excludedAt: null,
    rescheduledFromId: null,
    inOriginalPlan: true,
    isCustomized: false,
    createdAt: '2026-03-10T08:00:00.000Z',
    ...overrides,
  }
}

export function makeDay(overrides = {}) {
  return { planDate: TODAY, dayMode: 'normal', baselineAt: null, suppressedTemplateIds: [], ...overrides }
}

// Frozen deep copy: any accidental mutation by the code under test throws.
export const frozen = (value) => deepFreeze(JSON.parse(JSON.stringify(value)))
