import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { focusTotals, useFocusSession } from '../../src/hooks/useFocusSession.js'
import { remainingMs } from '../../src/utils/focus/focusSession.js'
import { focusStorageKeys, readLog } from '../../src/utils/focus/focusStore.js'

// The hook against fake timers and the real (jsdom) localStorage: a session started, paused, resumed, ended, finished, reloaded, and
// shared between two "tabs" (two hooks over the same storage).
const MIN = 60 * 1000
const USER = 'user-1'
const TASK = { id: 'task-1', planDate: '2026-03-10', title: 'Write the report' }
const minutesLeft = (hook) => Math.round(remainingMs(hook.result.current.session, hook.result.current.now) / MIN)
// Moves the clock in half-minute steps, and after each step does what the timer panel does each second for the given tabs: look at the timer
// (the hook itself does not tick). Steps are well under the two minutes that count as a gap.
const advance = (ms, ...tabs) => {
  for (let left = ms; left > 0; left -= 30 * 1000) {
    act(() => {
      vi.advanceTimersByTime(Math.min(30 * 1000, left))
      for (const tab of tabs) {
        tab.result.current.look()
        tab.result.current.refresh()
      }
    })
  }
}
// The computer sleeps: the clock jumps and nothing looks at the timer until it wakes.
const sleep = (minutes) => vi.setSystemTime(new Date(Date.now() + minutes * MIN))
const mount = (userId = USER) => renderHook(() => useFocusSession(userId))

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-03-10T09:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('a running session', () => {
  it('starts, counts down from the clock, and is saved', () => {
    const tab = mount()
    expect(tab.result.current.session).toBeNull()
    let outcome
    act(() => { outcome = tab.result.current.start(TASK, 25) })
    expect(outcome).toEqual({ ok: true })
    expect(tab.result.current.session).toMatchObject({ taskId: 'task-1', planDate: '2026-03-10', title: 'Write the report', status: 'running' })
    expect(minutesLeft(tab)).toBe(25)
    advance(10 * MIN, tab)
    expect(minutesLeft(tab)).toBe(15)
    expect(localStorage.getItem(focusStorageKeys.active(USER))).toContain('task-1')
  })

  it('does not count paused time, and resumes from where it stopped', () => {
    const tab = mount()
    act(() => { tab.result.current.start(TASK, 25) })
    advance(10 * MIN, tab)
    act(() => { tab.result.current.pause() })
    expect(tab.result.current.session.status).toBe('paused')
    advance(2 * 60 * MIN, tab) // two hours paused
    expect(minutesLeft(tab)).toBe(15)
    act(() => { tab.result.current.resume() })
    expect(tab.result.current.session.status).toBe('running')
    advance(5 * MIN, tab)
    expect(minutesLeft(tab)).toBe(10)
  })

  it('refuses a second session while one is active', () => {
    const tab = mount()
    act(() => { tab.result.current.start(TASK, 25) })
    let outcome
    act(() => { outcome = tab.result.current.start({ id: 'task-2', planDate: '2026-03-10', title: 'Other' }, 15) })
    expect(outcome).toEqual({ ok: false, reason: 'busy' })
    expect(tab.result.current.session.taskId).toBe('task-1')
  })
})

describe('after a refresh', () => {
  it('a running session has the right time left, even though the page was closed in between', () => {
    const first = mount()
    act(() => { first.result.current.start(TASK, 25) })
    first.unmount()
    vi.setSystemTime(new Date('2026-03-10T09:12:00Z')) // twelve minutes pass with no page open
    const second = mount()
    expect(second.result.current.session.status).toBe('running')
    expect(minutesLeft(second)).toBe(13)
  })

  it('a paused session is still paused, with the same time left', () => {
    const first = mount()
    act(() => { first.result.current.start(TASK, 45) })
    advance(20 * MIN, first)
    act(() => { first.result.current.pause() })
    first.unmount()
    vi.setSystemTime(new Date('2026-03-10T15:00:00Z'))
    const second = mount()
    expect(second.result.current.session.status).toBe('paused')
    expect(minutesLeft(second)).toBe(25)
  })

  it('one that ran out while the page was closed shows its summary once and is recorded once', () => {
    const first = mount()
    act(() => { first.result.current.start(TASK, 15) })
    first.unmount()
    vi.setSystemTime(new Date('2026-03-10T11:00:00Z'))
    const second = mount()
    expect(second.result.current.session).toBeNull()
    expect(second.result.current.result).toMatchObject({ outcome: 'completed', focusedMs: 15 * MIN })
    second.unmount()
    const third = mount()
    expect(third.result.current.result).toBeNull() // already shown and recorded: not again
    expect(readLog(USER)).toHaveLength(1)
  })

  it('unusable saved text is ignored', () => {
    localStorage.setItem(focusStorageKeys.active(USER), '{"v":1,"id":"x"')
    const tab = mount()
    expect(tab.result.current.session).toBeNull()
    expect(tab.result.current.result).toBeNull()
  })
})

describe('redrawing', () => {
  it('does not redraw the page on its own every second: only the timer panel does', () => {
    let renders = 0
    const tab = renderHook(() => { renders += 1; return useFocusSession(USER) })
    act(() => { tab.result.current.start(TASK, 25) })
    const before = renders
    act(() => { vi.advanceTimersByTime(120 * 1000) }) // two minutes of seconds
    expect(renders).toBe(before)
  })
})

describe('a gap (the computer slept)', () => {
  // A 45 minute session, seen for five minutes, then the computer sleeps for forty: the session would have run out unseen.
  const sleptAfterFiveMinutes = () => {
    const tab = mount()
    act(() => { tab.result.current.start(TASK, 45) })
    advance(5 * MIN, tab)
    sleep(40)
    return tab
  }
  const wake = (tab) => act(() => { tab.result.current.look() }) // the panel's next second

  it('marks the time not seen, stands the clock still, and waits for an answer, without completing or recording anything', () => {
    const tab = sleptAfterFiveMinutes()
    wake(tab)
    expect(tab.result.current.session.gapFrom).not.toBeNull()
    expect(minutesLeft(tab)).toBe(40) // 45 planned, only 5 seen
    expect(tab.result.current.result).toBeNull()
    expect(readLog(USER)).toHaveLength(0)
  })

  it('a first look that is not the timer panel (the tab becoming visible, the window focused) also does not count the time quietly', () => {
    const tab = sleptAfterFiveMinutes()
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(tab.result.current.session).not.toBeNull()
    expect(tab.result.current.session.gapFrom).not.toBeNull()
    expect(tab.result.current.result).toBeNull()
    expect(readLog(USER)).toHaveLength(0)
  })

  it('“count it” keeps the whole time, and the session then finishes as completed, once', () => {
    const tab = sleptAfterFiveMinutes()
    wake(tab)
    act(() => { tab.result.current.keepGap() })
    act(() => { tab.result.current.refresh() })
    expect(tab.result.current.session).toBeNull()
    expect(tab.result.current.result).toMatchObject({ outcome: 'completed', focusedMs: 45 * MIN })
    expect(readLog(USER)).toHaveLength(1)
  })

  it('“don’t count it” leaves the gap out and the session carries on from where it was seen', () => {
    const tab = sleptAfterFiveMinutes()
    wake(tab)
    act(() => { tab.result.current.dropGap() })
    expect(tab.result.current.session.gapFrom).toBeNull()
    expect(tab.result.current.session.status).toBe('running')
    expect(minutesLeft(tab)).toBe(40)
    advance(10 * MIN, tab)
    expect(minutesLeft(tab)).toBe(30)
  })

  it('ending the session while the question waits records only the time that was seen', () => {
    const tab = sleptAfterFiveMinutes()
    wake(tab)
    act(() => { tab.result.current.end() })
    expect(tab.result.current.result).toMatchObject({ outcome: 'ended_early', focusedMs: 5 * MIN })
  })

  it('pausing while the question waits keeps only the time that was seen', () => {
    const tab = sleptAfterFiveMinutes()
    wake(tab)
    act(() => { tab.result.current.pause() })
    expect(tab.result.current.session).toMatchObject({ status: 'paused', gapFrom: null })
    expect(minutesLeft(tab)).toBe(40)
  })

  it('the question is still there after a reload', () => {
    const first = sleptAfterFiveMinutes()
    wake(first)
    first.unmount()
    const second = mount()
    expect(second.result.current.session.gapFrom).not.toBeNull()
    expect(minutesLeft(second)).toBe(40)
    expect(second.result.current.result).toBeNull()
  })

  it('looking again while the question waits does not move the gap or ask a second time', () => {
    const tab = sleptAfterFiveMinutes()
    wake(tab)
    const first = tab.result.current.session.gapFrom
    sleep(20)
    wake(tab)
    expect(tab.result.current.session.gapFrom).toBe(first)
  })

  it('a paused session has no gap to mark, however long the computer sleeps', () => {
    const tab = mount()
    act(() => { tab.result.current.start(TASK, 45) })
    advance(5 * MIN, tab)
    act(() => { tab.result.current.pause() })
    sleep(300)
    wake(tab)
    expect(tab.result.current.session).toMatchObject({ status: 'paused', gapFrom: null })
    expect(minutesLeft(tab)).toBe(40)
  })

  it('there is nothing to answer when no session is active', () => {
    const tab = mount()
    let outcome
    act(() => { outcome = tab.result.current.keepGap() })
    expect(outcome).toEqual({ ok: false, reason: 'none' })
  })
})

describe('two tabs open on My Day', () => {
  it('a tab that was frozen for a while does not blame a gap on a session the other tab kept running', () => {
    const a = mount()
    const b = mount() // two tabs of the same person
    act(() => { a.result.current.start(TASK, 25) })
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: focusStorageKeys.active(USER) })) })
    // Tab A keeps looking at the timer every half minute for ten minutes; tab B is frozen and looks at nothing.
    advance(10 * MIN, a)
    // Tab B is woken: the timer has been running all along in the other tab.
    act(() => { b.result.current.refresh() })
    expect(b.result.current.session.gapFrom).toBeNull()
    expect(minutesLeft(b)).toBe(15)
  })

  it('but when both tabs were frozen (the computer slept) the gap is marked, once', () => {
    const a = mount()
    const b = mount()
    act(() => { a.result.current.start(TASK, 25) })
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: focusStorageKeys.active(USER) })) })
    advance(5 * MIN, a, b)
    sleep(40)
    act(() => { a.result.current.look() })
    act(() => { b.result.current.refresh() })
    expect(a.result.current.session.gapFrom).not.toBeNull()
    expect(b.result.current.session.gapFrom).toBe(a.result.current.session.gapFrom)
  })
})

describe('a tab in the background', () => {
  it('still ticking about once a minute (as browsers do for hidden tabs) keeps counting, with no question asked', () => {
    const tab = mount()
    act(() => { tab.result.current.start(TASK, 25) })
    for (let i = 0; i < 20; i += 1) {
      act(() => { vi.setSystemTime(new Date(Date.now() + 60 * 1000)); tab.result.current.look(); tab.result.current.refresh() })
    }
    expect(tab.result.current.session.gapFrom).toBeNull()
    expect(minutesLeft(tab)).toBe(5)
  })

  it('catches up from the clock when it is looked at again within the allowed gap', () => {
    const tab = mount()
    act(() => { tab.result.current.start(TASK, 25) })
    vi.setSystemTime(new Date(Date.now() + 90 * 1000)) // a minute and a half with no tick
    expect(minutesLeft(tab)).toBe(25) // not looked at yet
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(tab.result.current.session.gapFrom).toBeNull()
    expect(minutesLeft(tab)).toBe(24) // 90 seconds in: 23.5 minutes left, shown to the nearest minute
  })
})

describe('the two ways it ends', () => {
  it('ending early keeps the time focused, outside any pause, and says it ended early', () => {
    const tab = mount()
    act(() => { tab.result.current.start(TASK, 45) })
    advance(12 * MIN, tab)
    act(() => { tab.result.current.pause() })
    advance(30 * MIN, tab)
    act(() => { tab.result.current.resume() })
    advance(8 * MIN, tab)
    act(() => { tab.result.current.end() })
    expect(tab.result.current.session).toBeNull()
    expect(tab.result.current.result).toMatchObject({ outcome: 'ended_early', focusedMs: 20 * MIN, plannedMs: 45 * MIN, taskId: 'task-1' })
    expect(readLog(USER)).toHaveLength(1)
  })

  it('finishing on time records a completed session once, and keeps no active session', () => {
    const tab = mount()
    act(() => { tab.result.current.start(TASK, 15) })
    advance(15 * MIN + 2000, tab)
    expect(tab.result.current.session).toBeNull()
    expect(tab.result.current.result).toMatchObject({ outcome: 'completed', focusedMs: 15 * MIN })
    advance(10 * MIN, tab)
    expect(readLog(USER)).toHaveLength(1)
    expect(localStorage.getItem(focusStorageKeys.active(USER))).toBeNull()
  })

  it('does nothing to a task: the hook has no way to complete one', () => {
    const tab = mount()
    const keys = Object.keys(tab.result.current)
    expect(keys.some((k) => /complet|done/i.test(k))).toBe(false)
  })

  it('the summary can be closed', () => {
    const tab = mount()
    act(() => { tab.result.current.start(TASK, 15) })
    act(() => { tab.result.current.end() })
    expect(tab.result.current.result).not.toBeNull()
    act(() => { tab.result.current.dismissResult() })
    expect(tab.result.current.result).toBeNull()
  })
})

describe('two tabs', () => {
  it('see the same session, and only one can start it', () => {
    const a = mount()
    const b = mount()
    act(() => { a.result.current.start(TASK, 25) })
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: focusStorageKeys.active(USER) })) })
    expect(b.result.current.session?.taskId).toBe('task-1')
    let outcome
    act(() => { outcome = b.result.current.start({ id: 'task-2', planDate: '2026-03-10', title: 'Other' }, 15) })
    expect(outcome.reason).toBe('busy')
  })

  it('a session that finishes is recorded once, not once per tab', () => {
    const a = mount()
    const b = mount()
    act(() => { a.result.current.start(TASK, 15) })
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: focusStorageKeys.active(USER) })) })
    advance(16 * MIN, a, b)
    expect(readLog(USER)).toHaveLength(1)
    expect(a.result.current.session).toBeNull()
    expect(b.result.current.session).toBeNull()
  })

  it('ending in one tab, then in the other, records it once', () => {
    const a = mount()
    const b = mount()
    act(() => { a.result.current.start(TASK, 25) })
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: focusStorageKeys.active(USER) })) })
    advance(5 * MIN, a, b)
    let second
    act(() => { a.result.current.end() })
    act(() => { second = b.result.current.end() })
    expect(second).toEqual({ ok: false, reason: 'none' })
    expect(readLog(USER)).toHaveLength(1)
  })

  it('different people never see each other’s session', () => {
    const a = mount('user-1')
    act(() => { a.result.current.start(TASK, 25) })
    const other = mount('user-2')
    expect(other.result.current.session).toBeNull()
  })
})

describe('when it cannot work', () => {
  it('says so when the browser will not save', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    const tab = mount()
    let outcome
    act(() => { outcome = tab.result.current.start(TASK, 25) })
    expect(outcome).toEqual({ ok: false, reason: 'storage' })
    expect(tab.result.current.session).toBeNull()
  })

  it('is inactive without a signed-in person', () => {
    const tab = mount(null)
    expect(tab.result.current.ready).toBe(false)
    let outcome
    act(() => { outcome = tab.result.current.start(TASK, 25) })
    expect(outcome).toEqual({ ok: false, reason: 'signed-out' })
  })
})

describe('focusTotals', () => {
  const log = [
    { id: 'a', taskId: 't1', planDate: '2026-03-10', focusedMs: 25 * MIN },
    { id: 'b', taskId: 't1', planDate: '2026-03-10', focusedMs: 10 * MIN },
    { id: 'c', taskId: 't2', planDate: '2026-03-10', focusedMs: 15 * MIN },
    { id: 'd', taskId: 't1', planDate: '2026-03-09', focusedMs: 45 * MIN },
  ]
  it('adds up one day, in total and per task', () => {
    const totals = focusTotals(log, '2026-03-10')
    expect(totals.sessions).toBe(3)
    expect(totals.focusedMs).toBe(50 * MIN)
    expect(totals.byTask.get('t1')).toBe(35 * MIN)
    expect(totals.byTask.get('t2')).toBe(15 * MIN)
    expect(focusTotals(log, '2026-03-11')).toMatchObject({ sessions: 0, focusedMs: 0 })
  })
})
