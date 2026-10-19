import { describe, expect, it } from 'vitest'
import {
  AVAILABLE_CHOICES, DEFAULT_AVAILABLE_MINUTES, capacitySignature, capacityStatus, dayLoad, describeCapacity, describeSuggestion, isAvailableMinutes, suggestMoves,
} from '../../src/components/planner/capacity.js'
import { PRIORITY_LEVELS, levelFromFlag, levelOf, withLevelFromFlag } from '../../src/utils/planner/priority.js'

// A day's load against the person's own available time, and the gentle suggestion for a day that holds too much.
let n = 0
const task = (over = {}) => ({ id: `t${(n += 1)}`, title: over.title ?? `Task ${n}`, templateId: null, planState: 'active', completion: 0, priorityLevel: 'medium', plannedStart: null, plannedEnd: null, estimatedMinutes: 60, isMinimum: false, ...over })

describe('priority levels', () => {
  it('has three, and the level wins over the old flag', () => {
    expect(PRIORITY_LEVELS).toEqual(['high', 'medium', 'low'])
    expect(levelOf({ priorityLevel: 'low', isPriority: true })).toBe('low')
    expect(levelOf({ isPriority: true })).toBe('high')
    expect(levelOf({ isPriority: false })).toBe('medium')
    expect(levelOf({})).toBe('medium')
    expect(levelOf({ priorityLevel: 'urgent' })).toBe('medium')
  })

  it('turning the old flag on is high; off lowers high to medium and leaves low alone', () => {
    expect(levelFromFlag('low', true)).toBe('high')
    expect(levelFromFlag('high', false)).toBe('medium')
    expect(levelFromFlag('low', false)).toBe('low')
    expect(levelFromFlag('medium', false)).toBe('medium')
  })

  it('a partial edit that speaks only the old flag becomes a level, so a merge cannot keep a stale one', () => {
    expect(withLevelFromFlag({ priorityLevel: 'high' }, { isPriority: false })).toEqual({ isPriority: false, priorityLevel: 'medium' })
    expect(withLevelFromFlag({ priorityLevel: 'low' }, { isPriority: false })).toEqual({ isPriority: false, priorityLevel: 'low' })
    expect(withLevelFromFlag({ priorityLevel: 'low' }, { isPriority: true }).priorityLevel).toBe('high')
    const both = { isPriority: true, priorityLevel: 'low' }
    expect(withLevelFromFlag({ priorityLevel: 'high' }, both)).toBe(both) // an explicit level is left as it is
    const other = { title: 'x' }
    expect(withLevelFromFlag({ priorityLevel: 'high' }, other)).toBe(other)
  })
})

describe('available time', () => {
  it('is chosen in half hours from 30 minutes to 16 hours, and the default is one of them', () => {
    expect(AVAILABLE_CHOICES[0]).toBe(30)
    expect(AVAILABLE_CHOICES.at(-1)).toBe(16 * 60)
    expect(AVAILABLE_CHOICES).toHaveLength(32)
    expect(AVAILABLE_CHOICES).toContain(DEFAULT_AVAILABLE_MINUTES)
  })
  it('accepts whole minutes within the range only', () => {
    for (const ok of [30, 360, 960]) expect(isAvailableMinutes(ok)).toBe(true)
    for (const bad of [0, 29, 961, 1.5, NaN, '360', null, undefined]) expect(isAvailableMinutes(bad), String(bad)).toBe(false)
  })
})

describe('dayLoad', () => {
  it('adds the length of every task on the day, finished ones too, by block, else estimate', () => {
    const load = dayLoad([
      task({ plannedStart: '09:00', plannedEnd: '10:30', estimatedMinutes: 15 }), // 90: the block, not the estimate
      task({ estimatedMinutes: 45 }),
      task({ estimatedMinutes: 30, completion: 1 }), // done: still part of the day's load
    ])
    expect(load).toEqual({ minutes: 165, unknown: 0, count: 3 })
  })
  it('leaves out set-aside tasks, and counts the ones with no length apart', () => {
    expect(dayLoad([task({ planState: 'excluded' }), task({ estimatedMinutes: null }), task({ estimatedMinutes: 20 })])).toEqual({ minutes: 20, unknown: 1, count: 2 })
  })
})

describe('capacityStatus', () => {
  const status = (minutes, available = 360, extra = []) => capacityStatus({ tasks: [task({ estimatedMinutes: minutes }), ...extra], availableMinutes: available })
  it('is comfortable well within the time, nearly full from 85 percent, and over only beyond it', () => {
    expect(status(120).state).toBe('comfortable')
    expect(status(305).state).toBe('comfortable') // 84.7 percent
    expect(status(306).state).toBe('nearly-full') // 85 percent
    expect(status(360).state).toBe('nearly-full') // exactly what is available is not over
    expect(status(361)).toMatchObject({ state: 'over', over: 1 })
  })
  it('is empty with nothing planned, and says how much is over', () => {
    expect(capacityStatus({ tasks: [], availableMinutes: 360 })).toMatchObject({ state: 'empty', minutes: 0, over: 0 })
    expect(status(500)).toMatchObject({ state: 'over', over: 140, minutes: 500, available: 360 })
  })
})

describe('describeCapacity', () => {
  it('says planned of available, calmly', () => {
    expect(describeCapacity(capacityStatus({ tasks: [task({ estimatedMinutes: 120 })], availableMinutes: 360 }))).toBe('2 h planned of 6 h available.')
    expect(describeCapacity(capacityStatus({ tasks: [task({ estimatedMinutes: 330 })], availableMinutes: 360 }))).toBe('5 h 30 min planned of 6 h available: nearly full.')
    expect(describeCapacity(capacityStatus({ tasks: [task({ estimatedMinutes: 420 })], availableMinutes: 360 }))).toBe('7 h planned of 6 h available: 1 h more than the time you have.')
  })
  it('says when some tasks could not be counted', () => {
    const text = describeCapacity(capacityStatus({ tasks: [task({ estimatedMinutes: 60 }), task({ estimatedMinutes: null })], availableMinutes: 360 }))
    expect(text).toContain('1 task has no time or estimate, so not counted')
    expect(describeCapacity(capacityStatus({ tasks: [task({ estimatedMinutes: null })], availableMinutes: 360 }))).toContain('no time or estimate')
  })
})

describe('suggestMoves', () => {
  const suggest = (tasks, over, repeatingIds) => suggestMoves({ tasks, over, repeatingIds })
  it('suggests nothing when the day is not over', () => {
    expect(suggest([task({ priorityLevel: 'low' })], 0)).toEqual({ tasks: [], minutes: 0, enough: true })
  })
  it('lowest priority first, and stops as soon as enough time would be freed', () => {
    const low = task({ title: 'Low', priorityLevel: 'low', estimatedMinutes: 60 })
    const med = task({ title: 'Medium', priorityLevel: 'medium', estimatedMinutes: 60 })
    const result = suggest([med, low], 60)
    expect(result.tasks.map((t) => t.title)).toEqual(['Low'])
    expect(result).toMatchObject({ minutes: 60, enough: true })
    expect(suggest([med, low], 90).tasks.map((t) => t.title)).toEqual(['Low', 'Medium'])
  })
  it('never suggests a high priority task, a Minimum Day task, a done or partly done one, or a repeating one', () => {
    const tasks = [
      task({ title: 'High', priorityLevel: 'high' }),
      task({ title: 'Isolated minimum', isMinimum: true, priorityLevel: 'low' }),
      task({ title: 'Done', completion: 1, priorityLevel: 'low' }),
      task({ title: 'Partly', completion: 0.5, priorityLevel: 'low' }),
      task({ title: 'Repeats', templateId: 'tpl-r', priorityLevel: 'low' }),
      task({ title: 'Set aside', planState: 'excluded', priorityLevel: 'low' }),
      task({ title: 'Movable', priorityLevel: 'low' }),
    ]
    expect(suggest(tasks, 600, new Set(['tpl-r'])).tasks.map((t) => t.title)).toEqual(['Movable'])
  })
  it('a task made once has a template too, and is still suggested', () => {
    expect(suggest([task({ title: 'Once', templateId: 'tpl-once', priorityLevel: 'low' })], 30, new Set(['tpl-r'])).tasks.map((t) => t.title)).toEqual(['Once'])
  })
  it('among equals, the ones with no time come before the ones with a time, and later before earlier', () => {
    const tasks = [
      task({ title: 'Early', priorityLevel: 'low', plannedStart: '09:00' }),
      task({ title: 'Late', priorityLevel: 'low', plannedStart: '17:00' }),
      task({ title: 'Anytime', priorityLevel: 'low' }),
    ]
    expect(suggest(tasks, 600).tasks.map((t) => t.title)).toEqual(['Anytime', 'Late', 'Early'])
  })
  it('offers everything that qualifies when it still would not be enough, and says so', () => {
    const result = suggest([task({ priorityLevel: 'low', estimatedMinutes: 30 })], 120)
    expect(result).toMatchObject({ minutes: 30, enough: false })
    expect(result.tasks).toHaveLength(1)
  })
  it('a task with no length is not suggested (moving it would free no time)', () => {
    expect(suggest([task({ priorityLevel: 'low', estimatedMinutes: null })], 30).tasks).toEqual([])
  })
})

describe('the words of the suggestion', () => {
  const sug = (tasks, enough = true) => ({ tasks, minutes: 0, enough })
  it('names the tasks and where they would go, politely', () => {
    const text = describeSuggestion({ suggestion: sug([task({ title: 'Tidy desk' }), task({ title: 'Read' })]), nextLabel: 'Wednesday 11 Mar' })
    expect(text).toContain('If you like, you could move “Tidy desk”, “Read” to Wednesday 11 Mar')
    expect(text).toContain('back within your time')
  })
  it('is honest when moving would not be enough, and when nothing is easy to move', () => {
    expect(describeSuggestion({ suggestion: sug([task({ title: 'A' })], false), nextLabel: 'x' })).toContain('may still be a full day')
    expect(describeSuggestion({ suggestion: sug([]), nextLabel: 'x' })).toContain('it is yours to decide')
  })
  it('does not blame', () => {
    const text = describeSuggestion({ suggestion: sug([task()]), nextLabel: 'x' }) + describeSuggestion({ suggestion: sug([]), nextLabel: 'x' })
    expect(text).not.toMatch(/fail|overdue|behind|should have|lazy|too much work/i)
  })
  it('the signature changes only when the finding does', () => {
    const a = task()
    const base = capacitySignature(capacityStatus({ tasks: [a], availableMinutes: 30 }), sug([a]))
    expect(capacitySignature(capacityStatus({ tasks: [{ ...a }], availableMinutes: 30 }), sug([{ ...a }]))).toBe(base)
    expect(capacitySignature(capacityStatus({ tasks: [a], availableMinutes: 30 }), sug([]))).not.toBe(base)
  })
})
