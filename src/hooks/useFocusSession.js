import { useCallback, useEffect, useRef, useState } from 'react'
import { GAP_MS, dropGap, endedEarlyRecord, keepGap, markGap, pauseSession, restoreSession, resumeSession, startSession } from '../utils/focus/focusSession.js'
import { appendRecord, clearActive, focusStorageKeys, loadActive, readActiveRaw, readLog, readSeen, writeActive, writeSeen } from '../utils/focus/focusStore.js'

const SEEN_EVERY_MS = 10 * 1000 // how often the tab showing the timer leaves its "last seen" mark for the other tabs

const newId = (now) => `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`

// The focus timer of My Day. The saved session (this browser, this person) is the one source of truth: every change is written to it
// and then read back, so the page, a reload and a second tab always agree, and the time left is worked out from timestamps each time it is
// read (never from counting ticks). The hook refreshes when something changes and when the tab becomes visible or focused. It does NOT
// tick: the countdown's second-by-second redraw belongs to the timer panel alone, which calls look() each second and refresh() when the
// time is up, so My Day is not redrawn every second.
//
// Gaps. While the page is open the hook knows when the timer was last looked at (each look(), each refresh). If the next look comes more
// than GAP_MS later (the computer slept, the page was frozen) the session is first marked with that gap, BEFORE anything reads it, so the
// time in between is not counted, and a session that "ran out" during the gap is not quietly completed: the person is asked, and keepGap()
// or dropGap() answers. A page that was closed or reloaded has no last look to compare with, so a gap there is not noticed. With two tabs
// open, the tab that is showing the timer leaves a "last seen" mark in storage, so a tab that was frozen while the other kept the timer
// running does not mistake that for a gap.
//
//   session: the active session or null    now: the clock reading at the last refresh    result: the record of a session that just ended
//   log: this person's saved records       start(task, minutes) / pause() / resume() / end() -> { ok, reason }    refresh()    look()
//   keepGap() / dropGap(): the person's answer to a gap (the time counts / it is left out)
// `clock` returns milliseconds since 1970 (tests pass their own, and it must be the same function from one render to the next).
export function useFocusSession(userId, clock = Date.now) {
  const lastLook = useRef(null)
  const lastMark = useRef(0) // when this tab last wrote the shared "last seen" mark

  // Marks a gap if the timer has not been looked at for too long. Returns true when it did.
  const guardGap = useCallback(
    (now) => {
      if (!userId || lastLook.current === null) return false
      const from = Math.max(lastLook.current, readSeen(userId) ?? 0) // the latest look in any tab
      if (now - from <= GAP_MS) return false
      const raw = readActiveRaw(userId)
      const { session } = raw ? restoreSession(raw, from) : { session: null } // as it stood when last seen, before the silence
      if (!session || session.status !== 'running') return false
      const marked = markGap(session, from)
      if (marked === session) return false
      writeActive(userId, marked)
      return true
    },
    [userId],
  )

  // Looks at the saved session now: guards against a gap first, remembers this look, and closes anything that finished.
  const load = useCallback(
    (now) => {
      if (!userId) return { session: null, record: null, log: [], marked: false }
      const marked = guardGap(now)
      lastLook.current = now
      const { session, record } = loadActive(userId, now)
      return { session, record, log: readLog(userId), marked }
    },
    [userId, guardGap],
  )

  const [state, setState] = useState(() => {
    const now = clock()
    if (!userId) return { now, session: null, log: [], result: null }
    const { session, record } = loadActive(userId, now)
    return { now, session, log: readLog(userId), result: record }
  })

  useEffect(() => {
    lastLook.current = clock() // the first look at the timer is the page opening
  }, [clock])

  const sync = useCallback(() => {
    const now = clock()
    const next = load(now)
    setState((before) => ({ now, session: next.session, log: next.log, result: next.record ?? before.result }))
  }, [clock, load])

  // The panel's second-by-second look. Cheap: it only redraws My Day when it had to mark a gap.
  const look = useCallback(() => {
    const now = clock()
    if (guardGap(now)) {
      sync()
      return
    }
    lastLook.current = now
    if (userId && now - lastMark.current >= SEEN_EVERY_MS) {
      lastMark.current = now
      writeSeen(userId, now)
    }
  }, [clock, userId, guardGap, sync])

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
      if (load(now).session) {
        sync()
        return { ok: false, reason: 'busy' } // one session at a time, in every tab
      }
      const session = startSession({ id: newId(now), taskId: task.id, planDate: task.planDate, title: task.title, minutes, now })
      if (!writeActive(userId, session)) return { ok: false, reason: 'storage' }
      sync()
      return { ok: true }
    },
    [userId, clock, load, sync],
  )

  const change = useCallback(
    (transform) => {
      const now = clock()
      const { session } = load(now)
      if (!session) {
        sync()
        return { ok: false, reason: 'none' }
      }
      writeActive(userId, transform(session, now))
      sync()
      return { ok: true }
    },
    [userId, clock, load, sync],
  )
  const pause = useCallback(() => change(pauseSession), [change])
  const resume = useCallback(() => change(resumeSession), [change])
  const countGap = useCallback(() => change((session) => keepGap(session)), [change])
  const leaveGapOut = useCallback(() => change((session, now) => dropGap(session, now)), [change])

  const end = useCallback(() => {
    const now = clock()
    const { session } = load(now)
    if (!session) {
      sync()
      return { ok: false, reason: 'none' }
    }
    const record = endedEarlyRecord(session, now)
    clearActive(userId)
    appendRecord(userId, record)
    setState({ now, session: null, log: readLog(userId), result: record })
    return { ok: true }
  }, [userId, clock, load, sync])

  const dismissResult = useCallback(() => setState((before) => ({ ...before, result: null })), [])

  return { ...state, ready: Boolean(userId), refresh: sync, look, start, pause, resume, end, keepGap: countGap, dropGap: leaveGapOut, dismissResult }
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
