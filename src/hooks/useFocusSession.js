import { useCallback, useEffect, useState } from 'react'
import { endedEarlyRecord, pauseSession, resumeSession, startSession } from '../utils/focus/focusSession.js'
import { appendRecord, clearActive, focusStorageKeys, loadActive, readLog, writeActive } from '../utils/focus/focusStore.js'

const newId = (now) => `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`

// The focus timer of My Day. The saved session (this browser, this person) is the one source of truth: every change is written to it
// and then read back, so the page, a reload and a second tab always agree, and the time left is worked out from timestamps each time it is
// read (never from counting ticks). The hook refreshes when something changes and when the tab becomes visible or focused, so a
// throttled background tab catches up the moment it is looked at. It does NOT tick: the countdown's second-by-second redraw belongs to
// the timer panel alone, which calls refresh() when the time is up, so My Day is not redrawn every second.
//   session: the active session or null    now: the clock reading at the last refresh    result: the record of a session that just ended
//   log: this person's saved records       start(task, minutes) / pause() / resume() / end() -> { ok, reason }    refresh()
// `clock` returns milliseconds since 1970 (tests pass their own).
export function useFocusSession(userId, clock = Date.now) {
  const read = useCallback(() => {
    const now = clock()
    if (!userId) return { now, session: null, record: null, log: [] }
    const { session, record } = loadActive(userId, now)
    return { now, session, record, log: readLog(userId) }
  }, [userId, clock])

  const [state, setState] = useState(() => {
    const first = read()
    return { now: first.now, session: first.session, log: first.log, result: first.record }
  })

  const sync = useCallback(() => {
    const next = read()
    setState((before) => ({ now: next.now, session: next.session, log: next.log, result: next.record ?? before.result }))
  }, [read])

  useEffect(() => {
    if (!userId) return undefined
    const onVisible = () => document.visibilityState !== 'hidden' && sync()
    const onStorage = (e) => (e.key === null || e.key === focusStorageKeys.active(userId) || e.key === focusStorageKeys.log(userId)) && sync()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', sync)
    window.addEventListener('storage', onStorage)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', sync)
      window.removeEventListener('storage', onStorage)
    }
  }, [userId, sync])

  const start = useCallback(
    (task, minutes) => {
      if (!userId) return { ok: false, reason: 'signed-out' }
      const now = clock()
      if (loadActive(userId, now).session) {
        sync()
        return { ok: false, reason: 'busy' } // one session at a time, in every tab
      }
      const session = startSession({ id: newId(now), taskId: task.id, planDate: task.planDate, title: task.title, minutes, now })
      if (!writeActive(userId, session)) return { ok: false, reason: 'storage' }
      sync()
      return { ok: true }
    },
    [userId, clock, sync],
  )

  const change = useCallback(
    (transform) => {
      const now = clock()
      const { session } = userId ? loadActive(userId, now) : { session: null }
      if (!session) {
        sync()
        return { ok: false, reason: 'none' }
      }
      writeActive(userId, transform(session, now))
      sync()
      return { ok: true }
    },
    [userId, clock, sync],
  )
  const pause = useCallback(() => change(pauseSession), [change])
  const resume = useCallback(() => change(resumeSession), [change])

  const end = useCallback(() => {
    const now = clock()
    const { session } = userId ? loadActive(userId, now) : { session: null }
    if (!session) {
      sync()
      return { ok: false, reason: 'none' }
    }
    const record = endedEarlyRecord(session, now)
    clearActive(userId)
    appendRecord(userId, record)
    setState({ now, session: null, log: readLog(userId), result: record })
    return { ok: true }
  }, [userId, clock, sync])

  const dismissResult = useCallback(() => setState((before) => ({ ...before, result: null })), [])

  return { ...state, ready: Boolean(userId), refresh: sync, start, pause, resume, end, dismissResult }
}

// What the log says about one day: minutes focused, how many sessions, and minutes per task.
export function focusTotals(log, planDate) {
  const byTask = new Map()
  let focusedMs = 0
  let sessions = 0
  for (const r of log) {
    if (r.planDate !== planDate) continue
    sessions += 1
    focusedMs += r.focusedMs
    byTask.set(r.taskId, (byTask.get(r.taskId) ?? 0) + r.focusedMs)
  }
  return { focusedMs, sessions, byTask }
}
