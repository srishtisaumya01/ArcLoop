import { describe, expect, it } from 'vitest'
import { carryMessage, wrapUpOf } from '../../src/components/planner/dayWrapUp.js'
import { LONG_STRETCH_MS, VERY_LONG_STRETCH_MS, breakSuggestion } from '../../src/utils/focus/focusBreak.js'

// The end-of-day look back and the break suggestion, as plain functions.
const task = (id, over = {}) => ({ id, title: id, templateId: null, completion: 0, planState: 'active', ...over })
const MIN = 60 * 1000
const REPEATING = new Set(['tpl-1']) // the templates that really repeat

describe('wrapUpOf', () => {
  const day = [
    task('done', { completion: 1 }),
    task('partly', { completion: 0.5 }),
    task('open'),
    task('repeating', { templateId: 'tpl-1' }),
    task('repeating done', { templateId: 'tpl-1', completion: 1 }),
    task('aside', { planState: 'excluded' }),
    task('removed', { planState: 'excluded', completion: 0 }),
  ]

  it('splits the planned tasks into done and open, and says which of the open ones are partly done', () => {
    const w = wrapUpOf(day, REPEATING)
    expect(w.done.map((t) => t.id)).toEqual(['done', 'repeating done'])
    expect(w.open.map((t) => t.id)).toEqual(['partly', 'open', 'repeating'])
    expect(w.partly.map((t) => t.id)).toEqual(['partly'])
  })

  it('offers only open one-off tasks to carry over; a repeating task comes back on its own days', () => {
    const w = wrapUpOf(day, REPEATING)
    expect(w.carryable.map((t) => t.id)).toEqual(['partly', 'open'])
    expect(w.repeating.map((t) => t.id)).toEqual(['repeating'])
  })

  it('leaves out tasks that were set aside, moved or removed', () => {
    const w = wrapUpOf(day, REPEATING)
    const everything = [...w.done, ...w.open].map((t) => t.id)
    expect(everything).not.toContain('aside')
    expect(everything).not.toContain('removed')
  })

  it('handles an empty day and a day where everything is done', () => {
    expect(wrapUpOf([])).toEqual({ done: [], open: [], partly: [], carryable: [], repeating: [] })
    const w = wrapUpOf([task('a', { completion: 1 }), task('b', { completion: 1 })])
    expect(w.open).toEqual([])
    expect(w.done).toHaveLength(2)
  })

  it('does not change the tasks it is given', () => {
    const copy = JSON.parse(JSON.stringify(day))
    wrapUpOf(day, REPEATING)
    expect(day).toEqual(copy)
  })
})

describe('wrapUpOf: a task made once has a template too', () => {
  it('is carried over like any one-off task: only templates that really repeat keep a task out of the choice', () => {
    const w = wrapUpOf([task('once', { templateId: 'tpl-once' }), task('daily', { templateId: 'tpl-1' }), task('plain')], REPEATING)
    expect(w.carryable.map((t) => t.id)).toEqual(['once', 'plain'])
    expect(w.repeating.map((t) => t.id)).toEqual(['daily'])
  })

  it('treats every open task as carryable when nothing is known about repeating', () => {
    const w = wrapUpOf([task('daily', { templateId: 'tpl-1' }), task('plain')])
    expect(w.carryable.map((t) => t.id)).toEqual(['daily', 'plain'])
    expect(w.repeating).toEqual([])
  })
})

describe('carryMessage', () => {
  it('says how many moved, where to, and where to undo it', () => {
    expect(carryMessage({ moved: 3, tomorrowLabel: 'Wednesday 11 Mar', failure: null })).toBe('3 tasks moved to Wednesday 11 Mar. Each one can be undone under “Set aside or moved”.')
    expect(carryMessage({ moved: 1, tomorrowLabel: 'Wednesday 11 Mar', failure: null })).toMatch(/^1 task moved to Wednesday 11 Mar\./)
  })

  it('says how far it got when something went wrong, and that the rest stayed', () => {
    expect(carryMessage({ moved: 2, tomorrowLabel: 'Wednesday 11 Mar', failure: 'The connection failed.' })).toBe('2 tasks moved to Wednesday 11 Mar before something went wrong: The connection failed. The rest stayed where they were.')
    expect(carryMessage({ moved: 0, tomorrowLabel: 'Wednesday 11 Mar', failure: 'The connection failed.' })).toBe('Nothing was moved: The connection failed.')
  })

  it('never blames', () => {
    const text = [carryMessage({ moved: 2, tomorrowLabel: 'x', failure: null }), carryMessage({ moved: 0, tomorrowLabel: 'x', failure: 'Try again.' })].join(' ')
    expect(text).not.toMatch(/fail(ed)? to|behind|should have|lazy|missed/i)
  })
})

describe('breakSuggestion', () => {
  it('suggests nothing for a short or ordinary session', () => {
    expect(breakSuggestion(0)).toBeNull()
    expect(breakSuggestion(25 * MIN)).toBeNull()
    expect(breakSuggestion(LONG_STRETCH_MS - 1)).toBeNull()
  })

  it('suggests about five minutes after a long stretch and ten after a very long one', () => {
    expect(breakSuggestion(LONG_STRETCH_MS)).toMatchObject({ minutes: 5 })
    expect(breakSuggestion(59 * MIN)).toMatchObject({ minutes: 5 })
    expect(breakSuggestion(VERY_LONG_STRETCH_MS)).toMatchObject({ minutes: 10 })
  })

  it('is optional in its words', () => {
    const { text } = breakSuggestion(50 * MIN)
    expect(text).toContain('if you like')
    expect(text).not.toMatch(/must|need to|have to|should/i)
  })

  it('ignores anything that is not a number of milliseconds', () => {
    expect(breakSuggestion(undefined)).toBeNull()
    expect(breakSuggestion(Number.NaN)).toBeNull()
    expect(breakSuggestion(null)).toBeNull()
  })
})
