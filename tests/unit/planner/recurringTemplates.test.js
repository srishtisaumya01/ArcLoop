import { describe, expect, it } from 'vitest'
import { groupRecurringTemplates, isRecurringTemplate, templateStatus } from '../../../src/utils/planner/index.js'
import { editSummary } from '../../../src/components/planner/templateSummary.js'
import { makeTemplate } from './fixtures.js'

const TODAY = '2026-03-10'
const t = (over) => makeTemplate({ archivedAt: null, ...over })

describe('templateStatus', () => {
  it('is active while a template is running, with or without a future end date', () => {
    expect(templateStatus(t({ startsOn: '2026-01-01' }), TODAY)).toBe('active')
    expect(templateStatus(t({ startsOn: TODAY }), TODAY)).toBe('active')
    expect(templateStatus(t({ startsOn: '2026-01-01', endsOn: TODAY }), TODAY)).toBe('active') // the end date itself still counts
    expect(templateStatus(t({ startsOn: '2026-01-01', endsOn: '2026-04-01' }), TODAY)).toBe('active')
  })

  it('is upcoming before its start date', () => {
    expect(templateStatus(t({ startsOn: '2026-03-11' }), TODAY)).toBe('upcoming')
  })

  it('is ended when archived or when its end date has passed, whatever else is true', () => {
    expect(templateStatus(t({ archivedAt: '2026-03-09T10:00:00Z' }), TODAY)).toBe('ended')
    expect(templateStatus(t({ endsOn: '2026-03-09' }), TODAY)).toBe('ended')
    expect(templateStatus(t({ startsOn: '2026-03-20', archivedAt: '2026-03-09T10:00:00Z' }), TODAY)).toBe('ended')
  })

  it('moves with the local date it is given (timezone-independent)', () => {
    const template = t({ startsOn: '2026-03-10', endsOn: '2026-03-10' })
    expect(templateStatus(template, '2026-03-10')).toBe('active')
    expect(templateStatus(template, '2026-03-11')).toBe('ended')
    expect(templateStatus(template, '2026-03-09')).toBe('upcoming')
  })
})

describe('groupRecurringTemplates', () => {
  it('leaves out one-off tasks and groups the rest in a stable order', () => {
    const list = [
      t({ id: 'b', title: 'Walk' }),
      t({ id: 'a', title: 'Read' }),
      t({ id: 'c', title: 'Once', recurrence: 'once', startsOn: TODAY, endsOn: TODAY }),
      t({ id: 'd', title: 'Gym', recurrence: 'weekly', weekdays: [2], startsOn: '2026-03-20' }),
      t({ id: 'e', title: 'Old', endsOn: '2026-03-01' }),
    ]
    const g = groupRecurringTemplates(list, TODAY)
    expect(g.active.map((x) => x.title)).toEqual(['Read', 'Walk'])
    expect(g.upcoming.map((x) => x.title)).toEqual(['Gym'])
    expect(g.ended.map((x) => x.title)).toEqual(['Old'])
    expect(isRecurringTemplate(list[2])).toBe(false)
  })

  it('does not change its input', () => {
    const list = Object.freeze([Object.freeze(t({ id: 'a' }))])
    expect(() => groupRecurringTemplates(list, TODAY)).not.toThrow()
  })
})

describe('editSummary', () => {
  it('says what happened to days that already exist, without blame', () => {
    expect(editSummary({})).toBe('Saved.')
    expect(editSummary({ updatedOccurrenceIds: ['a'] })).toBe('Saved. 1 upcoming day was updated.')
    const text = editSummary({
      updatedOccurrenceIds: ['a', 'b'],
      skipped: [{ reason: 'past' }, { reason: 'has_progress' }, { reason: 'customized' }, { reason: 'no_longer_matches' }],
      noLongerMatching: ['x'],
    })
    expect(text).toContain('2 upcoming days were updated.')
    expect(text).toContain('2 planned days were left as they are because you’ve already worked on or changed them.')
    expect(text).toContain('1 planned day no longer matches the new schedule and was left in place')
    expect(text).not.toMatch(/fail|miss|behind|sorry|error/i)
  })
})
