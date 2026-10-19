import { describe, expect, it } from 'vitest'
import { LONG_DAY_MINUTES, blockOf, checkSchedule, checkSignature, clockText, describeChecks, findOverlaps, hasFindings } from '../../src/components/planner/scheduleChecks.js'

// The schedule checks as plain functions of a day's tasks. Times are written as 'HH:MM'; `at(h, m)` is minutes after midnight.
const task = (id, over = {}) => ({ id, title: id, plannedStart: null, plannedEnd: null, estimatedMinutes: null, completion: 0, ...over })
const at = (h, m = 0) => h * 60 + m
const ids = (pairs) => pairs.map(({ first, second }) => `${first.id}+${second.id}`)

describe('blockOf', () => {
  it('is the start to the end, or to start + estimate, or a bare start, or nothing without a start', () => {
    expect(blockOf(task('a', { plannedStart: '09:00', plannedEnd: '10:30' }))).toEqual({ start: at(9), end: at(10, 30) })
    expect(blockOf(task('b', { plannedStart: '09:00', estimatedMinutes: 45 }))).toEqual({ start: at(9), end: at(9, 45) })
    expect(blockOf(task('c', { plannedStart: '09:00' }))).toEqual({ start: at(9), end: null })
    expect(blockOf(task('d', { estimatedMinutes: 30 }))).toBeNull()
  })

  it('an end time wins over an estimate, and a block never runs past midnight', () => {
    expect(blockOf(task('a', { plannedStart: '09:00', plannedEnd: '09:20', estimatedMinutes: 90 })).end).toBe(at(9, 20))
    expect(blockOf(task('b', { plannedStart: '23:30', estimatedMinutes: 120 })).end).toBe(24 * 60)
  })
})

describe('findOverlaps', () => {
  it('finds two blocks that share part of the day', () => {
    const pairs = findOverlaps([task('a', { plannedStart: '09:00', plannedEnd: '10:00' }), task('b', { plannedStart: '09:30', plannedEnd: '10:30' })])
    expect(ids(pairs)).toEqual(['a+b'])
  })

  it('does not count blocks that only touch, or are apart', () => {
    expect(findOverlaps([task('a', { plannedStart: '09:00', plannedEnd: '10:00' }), task('b', { plannedStart: '10:00', plannedEnd: '11:00' })])).toEqual([])
    expect(findOverlaps([task('a', { plannedStart: '09:00', plannedEnd: '10:00' }), task('b', { plannedStart: '13:00', plannedEnd: '14:00' })])).toEqual([])
  })

  it('finds a block inside another one', () => {
    expect(ids(findOverlaps([task('long', { plannedStart: '09:00', plannedEnd: '12:00' }), task('short', { plannedStart: '10:00', plannedEnd: '10:30' })]))).toEqual(['long+short'])
  })

  it('a bare start overlaps a block it falls inside, or the same minute, and nothing else', () => {
    const block = task('block', { plannedStart: '09:00', plannedEnd: '10:00' })
    expect(ids(findOverlaps([block, task('inside', { plannedStart: '09:30' })]))).toEqual(['block+inside'])
    expect(ids(findOverlaps([block, task('same', { plannedStart: '09:00' })]))).toEqual(['block+same'])
    expect(findOverlaps([block, task('after', { plannedStart: '10:00' })])).toEqual([]) // the block has ended
    expect(findOverlaps([block, task('before', { plannedStart: '08:59' })])).toEqual([])
    expect(ids(findOverlaps([task('x', { plannedStart: '09:00' }), task('y', { plannedStart: '09:00' })]))).toEqual(['x+y'])
    expect(findOverlaps([task('x', { plannedStart: '09:00' }), task('y', { plannedStart: '09:05' })])).toEqual([]) // two bare starts do not collide
  })

  it('uses the estimate when there is no end time', () => {
    expect(ids(findOverlaps([task('a', { plannedStart: '09:00', estimatedMinutes: 60 }), task('b', { plannedStart: '09:45', plannedEnd: '10:15' })]))).toEqual(['a+b'])
    expect(findOverlaps([task('a', { plannedStart: '09:00', estimatedMinutes: 30 }), task('b', { plannedStart: '09:45', plannedEnd: '10:15' })])).toEqual([])
  })

  it('leaves out finished tasks and tasks with no time', () => {
    expect(findOverlaps([task('done', { plannedStart: '09:00', plannedEnd: '10:00', completion: 1 }), task('b', { plannedStart: '09:30', plannedEnd: '10:30' })])).toEqual([])
    expect(findOverlaps([task('a', { plannedStart: '09:00', plannedEnd: '10:00' }), task('free', { estimatedMinutes: 60 })])).toEqual([])
    expect(ids(findOverlaps([task('half', { plannedStart: '09:00', plannedEnd: '10:00', completion: 0.5 }), task('b', { plannedStart: '09:30', plannedEnd: '10:30' })]))).toEqual(['half+b'])
  })

  it('lists three tasks that overlap pair by pair, earliest first', () => {
    const pairs = findOverlaps([task('c', { plannedStart: '09:20', plannedEnd: '10:00' }), task('a', { plannedStart: '09:00', plannedEnd: '09:40' }), task('b', { plannedStart: '09:10', plannedEnd: '09:30' })])
    expect(ids(pairs)).toEqual(['a+b', 'a+c', 'b+c'])
  })
})

describe('checkSchedule: how much is planned', () => {
  const hours = (h, over = {}) => task(`t${h}${Object.keys(over).join('')}`, { estimatedMinutes: h * 60, ...over })

  it('says nothing for a day that fits', () => {
    expect(checkSchedule({ tasks: [hours(2), hours(3)], nowMinutes: at(9) })).toEqual({ overlaps: [], load: null })
  })

  it('today: warns when more is planned than the time left', () => {
    const { load } = checkSchedule({ tasks: [hours(3), hours(2)], nowMinutes: at(20) })
    expect(load).toEqual({ kind: 'left-today', minutes: 300, left: 240 })
  })

  it('today: exactly what fits is fine', () => {
    expect(checkSchedule({ tasks: [hours(4)], nowMinutes: at(20) }).load).toBeNull()
  })

  it('today: early in the day the long-day limit applies instead', () => {
    expect(checkSchedule({ tasks: [hours(10), hours(7)], nowMinutes: at(6) }).load).toMatchObject({ kind: 'too-long', minutes: 17 * 60 })
    expect(checkSchedule({ tasks: [hours(10), hours(6)], nowMinutes: at(6) }).load).toBeNull() // 16 hours is not over the limit
  })

  it('another day: only the long-day limit applies', () => {
    expect(checkSchedule({ tasks: [hours(9), hours(8)], nowMinutes: null }).load).toMatchObject({ kind: 'too-long' })
    expect(checkSchedule({ tasks: [hours(9), hours(7)], nowMinutes: null }).load).toBeNull()
    expect(LONG_DAY_MINUTES).toBe(16 * 60)
  })

  it('counts a block by its times, a task by its estimate, and ignores finished ones and ones with no length', () => {
    const tasks = [
      task('block', { plannedStart: '09:00', plannedEnd: '12:00', estimatedMinutes: 15 }), // 180: the block, not the estimate
      task('estimate', { estimatedMinutes: 60 }), // 60
      task('done', { estimatedMinutes: 600, completion: 1 }), // finished: not counted
      task('unknown'), // no length: not counted
    ]
    expect(checkSchedule({ tasks, nowMinutes: at(20) }).load).toBeNull() // 240 minutes planned, exactly 240 left
    expect(checkSchedule({ tasks, nowMinutes: at(20, 30) }).load).toEqual({ kind: 'left-today', minutes: 240, left: 210 })
  })

  it('reports overlaps and load together', () => {
    const tasks = [task('a', { plannedStart: '19:00', plannedEnd: '21:00' }), task('b', { plannedStart: '20:00', plannedEnd: '22:00' }), hours(3)]
    const result = checkSchedule({ tasks, nowMinutes: at(19, 30) })
    expect(ids(result.overlaps)).toEqual(['a+b'])
    expect(result.load.kind).toBe('left-today')
  })
})

describe('the words', () => {
  it('names each overlapping pair with their times, calmly', () => {
    const lines = describeChecks(checkSchedule({ tasks: [task('Dentist', { plannedStart: '09:00', plannedEnd: '09:45' }), task('Call mum', { plannedStart: '09:30' })], nowMinutes: null }))
    expect(lines).toEqual(['“Dentist” (09:00 to 09:45) overlaps “Call mum” (09:30).'])
  })

  it('says how much is planned and how much is left, without blame', () => {
    const [line] = describeChecks({ overlaps: [], load: { kind: 'left-today', minutes: 300, left: 150 } })
    expect(line).toBe('About 5 h of tasks are still planned, and about 2 h 30 min are left today. Moving one or two to another day is fine.')
    const [long] = describeChecks({ overlaps: [], load: { kind: 'too-long', minutes: 1020, left: null } })
    expect(long).toContain('more than a day can hold')
    expect(`${line}${long}`).not.toMatch(/fail|behind|should have|late|lazy/i)
  })

  it('formats the time of day', () => {
    expect(clockText(0)).toBe('00:00')
    expect(clockText(at(9, 5))).toBe('09:05')
    expect(clockText(at(23, 59))).toBe('23:59')
  })
})

describe('signature and findings', () => {
  const a = task('a', { plannedStart: '09:00', plannedEnd: '10:00' })
  const b = task('b', { plannedStart: '09:30', plannedEnd: '10:30' })
  it('has findings only when something was found', () => {
    expect(hasFindings({ overlaps: [], load: null })).toBe(false)
    expect(hasFindings(checkSchedule({ tasks: [a, b], nowMinutes: null }))).toBe(true)
    expect(hasFindings({ overlaps: [], load: { kind: 'too-long', minutes: 1000, left: null } })).toBe(true)
  })

  it('stays the same for the same findings and changes for new ones', () => {
    const one = checkSignature(checkSchedule({ tasks: [a, b], nowMinutes: null }))
    expect(checkSignature(checkSchedule({ tasks: [{ ...a }, { ...b }], nowMinutes: null }))).toBe(one)
    const c = task('c', { plannedStart: '09:45', plannedEnd: '10:15' })
    expect(checkSignature(checkSchedule({ tasks: [a, b, c], nowMinutes: null }))).not.toBe(one)
  })
})
