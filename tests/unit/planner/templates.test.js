import { describe, expect, it } from 'vitest'
import { ERR, PlannerError, planTemplateEdit, validateTemplateInput } from '../../../src/utils/planner/index.js'
import { TODAY, ctx, frozen, makeOcc, makeTemplate } from './fixtures.js'

const base = { title: 'Read', recurrence: 'daily', startsOn: '2026-03-10' }
const check = (extra = {}, options) => validateTemplateInput({ ...base, ...extra }, options)

describe('validateTemplateInput: valid input', () => {
  it('accepts a title-only daily task and fills defaults', () => {
    const { ok, value, errors } = check()
    expect(ok).toBe(true)
    expect(errors).toEqual({})
    expect(value).toEqual({
      title: 'Read', description: null, category: null, isPriority: false, priorityLevel: 'medium',
      plannedStart: null, plannedEnd: null, estimatedMinutes: null,
      recurrence: 'daily', weekdays: null, startsOn: '2026-03-10', endsOn: null,
    })
  })

  it('trims text and keeps all optional details', () => {
    const { value } = check({
      title: '  Gym  ', description: ' legs ', category: ' Exercise ', isPriority: true,
      plannedStart: '07:00', plannedEnd: '08:00', estimatedMinutes: '45',
    })
    expect(value).toMatchObject({ title: 'Gym', description: 'legs', category: 'Exercise', isPriority: true, plannedStart: '07:00', plannedEnd: '08:00', estimatedMinutes: 45 })
  })

  it('treats empty strings as "not set"', () => {
    const { value } = check({ description: '', category: '  ', plannedStart: '', plannedEnd: '', estimatedMinutes: '', endsOn: '' })
    expect(value).toMatchObject({ description: null, category: null, plannedStart: null, plannedEnd: null, estimatedMinutes: null, endsOn: null })
  })

  it('supports a point-in-time task (start only), as used for bedtime and wake-up (D7)', () => {
    const { ok, value } = check({ title: 'Bedtime', plannedStart: '23:00' })
    expect(ok).toBe(true)
    expect(value.plannedStart).toBe('23:00')
    expect(value.plannedEnd).toBeNull()
  })

  it('accepts free-text custom categories (D3) and a single priority flag (D2)', () => {
    expect(check({ category: 'Learn the guitar' }).value.category).toBe('Learn the guitar')
    expect(check({ isPriority: false }).value.isPriority).toBe(false)
  })

  it('has three priority levels; the level wins over the old on/off flag, which still means high or medium', () => {
    for (const [priorityLevel, isPriority] of [['high', true], ['medium', false], ['low', false]]) {
      expect(check({ priorityLevel }).value).toMatchObject({ priorityLevel, isPriority })
    }
    expect(check({ isPriority: true }).value).toMatchObject({ priorityLevel: 'high', isPriority: true })
    expect(check({ isPriority: false }).value).toMatchObject({ priorityLevel: 'medium', isPriority: false })
    expect(check({ priorityLevel: 'low', isPriority: true }).value).toMatchObject({ priorityLevel: 'low', isPriority: false })
    expect(check({}).value.priorityLevel).toBe('medium')
  })

  it('refuses an unknown level with a message for the field', () => {
    for (const bad of ['urgent', 'HIGH', '', 3, true]) expect(check({ priorityLevel: bad }).errors.priorityLevel, String(bad)).toMatch(/High, Medium or Low/)
  })

  it('normalises selected weekdays: sorted, de-duplicated', () => {
    expect(check({ recurrence: 'weekly', weekdays: [5, 1, 5, 3] }).value.weekdays).toEqual([1, 3, 5])
  })

  it('one-time tasks end on their start date', () => {
    expect(check({ recurrence: 'once' }).value.endsOn).toBe('2026-03-10')
    expect(check({ recurrence: 'once', endsOn: '2026-03-10' }).ok).toBe(true)
  })
})

describe('validateTemplateInput: invalid input', () => {
  it('requires a title within the limit', () => {
    expect(check({ title: '   ' }).errors.title).toMatch(/title/i)
    expect(check({ title: undefined }).errors.title).toBeTruthy()
    expect(check({ title: 'x'.repeat(120) }).ok).toBe(true)
    expect(check({ title: 'x'.repeat(121) }).errors.title).toMatch(/120/)
  })

  it('limits description and category length and type', () => {
    expect(check({ description: 'x'.repeat(1001) }).errors.description).toMatch(/1000/)
    expect(check({ category: 'x'.repeat(41) }).errors.category).toMatch(/40/)
    expect(check({ description: 5 }).errors.description).toBeTruthy()
    expect(check({ category: {} }).errors.category).toBeTruthy()
  })

  it('validates times', () => {
    expect(check({ plannedStart: '25:00' }).errors.plannedStart).toBeTruthy()
    expect(check({ plannedStart: '9:30' }).errors.plannedStart).toBeTruthy()
    expect(check({ plannedEnd: '10:00' }).errors.plannedEnd).toMatch(/start time first/i)
    expect(check({ plannedStart: '10:00', plannedEnd: '10:00' }).errors.plannedEnd).toMatch(/after the start/i)
    expect(check({ plannedStart: '10:00', plannedEnd: '09:00' }).errors.plannedEnd).toMatch(/after the start/i)
    expect(check({ plannedStart: '23:00', plannedEnd: '23:59' }).ok).toBe(true)
  })

  it('does not allow an overnight span (sleep uses two point tasks)', () => {
    expect(check({ plannedStart: '23:00', plannedEnd: '06:30' }).ok).toBe(false)
  })

  it('validates estimated minutes', () => {
    for (const bad of [0, -5, 1.5, 1441, 'abc', '1.5', NaN, true]) {
      expect(check({ estimatedMinutes: bad }).errors.estimatedMinutes, String(bad)).toBeTruthy()
    }
    for (const good of [1, 1440, '90']) expect(check({ estimatedMinutes: good }).ok).toBe(true)
  })

  it('validates priority type', () => {
    expect(check({ isPriority: 'yes' }).errors.isPriority).toBeTruthy()
    expect(check({ isPriority: 1 }).errors.isPriority).toBeTruthy()
  })

  it('validates recurrence and weekdays', () => {
    expect(check({ recurrence: 'monthly' }).errors.recurrence).toBeTruthy()
    expect(check({ recurrence: 'weekly' }).errors.weekdays).toBeTruthy()
    expect(check({ recurrence: 'weekly', weekdays: [] }).errors.weekdays).toBeTruthy()
    expect(check({ recurrence: 'weekly', weekdays: [0] }).errors.weekdays).toBeTruthy()
    expect(check({ recurrence: 'weekly', weekdays: [8] }).errors.weekdays).toBeTruthy()
    expect(check({ recurrence: 'weekly', weekdays: [1.5] }).errors.weekdays).toBeTruthy()
    expect(check({ recurrence: 'weekly', weekdays: ['1'] }).errors.weekdays).toBeTruthy()
    expect(check({ recurrence: 'daily', weekdays: [1] }).errors.weekdays).toBeTruthy()
  })

  it('validates dates', () => {
    expect(check({ startsOn: '2026-02-30' }).errors.startsOn).toBeTruthy()
    expect(check({ startsOn: undefined }).errors.startsOn).toBeTruthy()
    expect(check({ endsOn: '2026-03-09' }).errors.endsOn).toMatch(/before the start/i)
    expect(check({ endsOn: 'soon' }).errors.endsOn).toBeTruthy()
    expect(check({ recurrence: 'once', endsOn: '2026-03-11' }).errors.endsOn).toMatch(/single day/i)
  })

  it('reports several problems at once', () => {
    const { ok, value, errors } = check({ title: '', startsOn: 'x', estimatedMinutes: 0 })
    expect(ok).toBe(false)
    expect(value).toBeNull()
    expect(Object.keys(errors).sort()).toEqual(['estimatedMinutes', 'startsOn', 'title'])
  })

  it('rejects missing or non-object input', () => {
    for (const bad of [null, undefined, 'task', 5]) expect(validateTemplateInput(bad).ok).toBe(false)
  })
})

describe('validateTemplateInput: planning window for one-time tasks (D5)', () => {
  const once = (startsOn) => check({ recurrence: 'once', startsOn }, { today: TODAY })

  it('allows today and the previous 6 dates; rejects older', () => {
    expect(once('2026-03-04').ok).toBe(true) // today - 6
    expect(once('2026-03-03').errors.startsOn).toMatch(/history/i) // today - 7
  })

  it('allows up to 30 days ahead; rejects further', () => {
    expect(once('2026-04-09').ok).toBe(true) // today + 30
    expect(once('2026-04-10').errors.startsOn).toMatch(/further ahead/i)
  })

  it('does not restrict the start date of a recurring rule', () => {
    expect(check({ startsOn: '2025-01-01' }, { today: TODAY }).ok).toBe(true)
  })

  it('honours a custom configuration', () => {
    const r = check({ recurrence: 'once', startsOn: '2026-03-20' }, { today: TODAY, config: { planAheadDays: 5 } })
    expect(r.errors.startsOn).toMatch(/further ahead/i)
  })
})

describe('planTemplateEdit', () => {
  const template = makeTemplate({ id: 'tpl', title: 'Walk', plannedStart: '07:00' })
  const future = (id, extra = {}) => makeOcc({ id, templateId: 'tpl', planDate: '2026-03-12', title: 'Walk', plannedStart: '07:00', ...extra })

  it('updates only future, pending, active, non-customised occurrences', () => {
    const occurrences = [
      future('future-ok'),
      future('today-ok', { planDate: TODAY }),
      future('past', { planDate: '2026-03-09' }),
      future('progress', { completion: 0.5, completedAt: '2026-03-10T10:00:00.000Z' }),
      future('set-aside', { planState: 'excluded', excludedReason: 'busy_day' }),
      future('custom', { isCustomized: true }),
      makeOcc({ id: 'other-template', templateId: 'zzz', planDate: '2026-03-12' }),
    ]
    const result = planTemplateEdit({ template, changes: { title: 'Brisk walk', estimatedMinutes: 30 }, occurrences: frozen(occurrences) }, ctx())
    expect(result.updates.map((u) => u.id).sort()).toEqual(['future-ok', 'today-ok'])
    expect(result.updates[0].changes).toEqual({ title: 'Brisk walk', estimatedMinutes: 30 })
    expect(Object.fromEntries(result.skipped.map((s) => [s.id, s.reason]))).toEqual({
      past: 'past', progress: 'has_progress', 'set-aside': 'set_aside', custom: 'customized',
    })
    expect(result.template.title).toBe('Brisk walk')
  })

  it('never rewrites a past occurrence: history keeps the title it had', () => {
    const past = future('past', { planDate: '2026-03-09', title: 'Walk' })
    const { updates } = planTemplateEdit({ template, changes: { title: 'Run' }, occurrences: frozen([past]) }, ctx())
    expect(updates).toEqual([])
  })

  it('reports occurrences on dates the edited template no longer matches, without removing them', () => {
    const weeklyTemplate = makeTemplate({ id: 'tpl', recurrence: 'weekly', weekdays: [1, 2, 3, 4, 5, 6, 7] })
    const thursday = future('thu') // 2026-03-12 is a Thursday
    const result = planTemplateEdit({ template: weeklyTemplate, changes: { weekdays: [1, 2] }, occurrences: frozen([thursday]) }, ctx())
    expect(result.noLongerMatching).toEqual(['thu'])
    expect(result.updates).toEqual([])
  })

  it('produces no update when nothing differs', () => {
    const result = planTemplateEdit({ template, changes: {}, occurrences: frozen([future('same')]) }, ctx())
    expect(result.updates).toEqual([])
  })

  it('refuses an invalid edit with field errors', () => {
    let error
    try {
      planTemplateEdit({ template, changes: { title: '' }, occurrences: [] }, ctx())
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(PlannerError)
    expect(error.code).toBe(ERR.INVALID_TEMPLATE)
    expect(error.details.errors.title).toBeTruthy()
  })
})
