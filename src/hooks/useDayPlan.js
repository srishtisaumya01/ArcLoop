import { useCallback, useEffect, useRef, useState } from 'react'
import { plannerService } from '../services/planner/index.js'
import { PROFILE_CHANGED } from './profileEvents.js'
import { classifyDate } from '../utils/planner/index.js'

// Loads one day's plan through the planner service and runs changes against it.
// Today and the editable past are opened (created and topped up from templates); future days and
// read-only history are only read, so browsing never creates rows by accident. `start` opens a
// future day on purpose.
//   status: 'loading' | 'success' | 'error'    (an error after a success keeps `data`)
//   run(fn): runs a service change, reloads the day, and resolves { ok, result, error } (never throws); `result` is what the
//            service call returned (the same shape useRecurringTasks gives)
//   getRepeatingIds(): the ids of the person's templates that really repeat (a task made once has a template too), for the wrap-up and
//            the capacity note, which must not offer to move a repeating task
export function useDayPlan(date) {
  const key = date ?? 'today'
  const [result, setResult] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  // The day the screen shows right now. A change that finishes after the person has moved to another day must not
  // replace that day's data (the single `result` slot is keyed, so a stale write would leave the new day loading forever).
  const shown = useRef(key)
  useEffect(() => {
    shown.current = key
  }, [key])

  const fetchPlan = useCallback(async ({ open = false } = {}) => {
    const { today } = await plannerService.getToday()
    const target = date ?? today
    const access = classifyDate(target, today)
    const plan = open || access === 'today' || access === 'editable_past' ? await plannerService.openDay(target) : await plannerService.getDayPlan(target)
    return { ...plan, today }
  }, [date])

  useEffect(() => {
    let cancelled = false
    fetchPlan().then(
      (data) => !cancelled && setResult({ key, status: 'success', data, error: null }),
      (error) => !cancelled && setResult((prev) => ({ key, status: 'error', data: prev?.key === key ? prev.data : null, error })),
    )
    return () => {
      cancelled = true
    }
  }, [fetchPlan, key, attempt])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setAttempt((n) => n + 1)
    }
    const onProfile = () => setAttempt((n) => n + 1) // a new timezone changes what 'today' is
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(PROFILE_CHANGED, onProfile)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(PROFILE_CHANGED, onProfile)
    }
  }, [])

  const run = useCallback(
    async (change, { open = false } = {}) => {
      setBusy(true)
      let outcome
      try {
        outcome = { ok: true, result: await change(plannerService), error: null }
      } catch (error) {
        outcome = { ok: false, result: null, error }
      }
      try {
        const data = await fetchPlan({ open })
        if (shown.current === key) setResult({ key, status: 'success', data, error: null })
      } catch (error) {
        if (shown.current === key) setResult((prev) => ({ key, status: 'error', data: prev?.key === key ? prev.data : null, error }))
      }
      setBusy(false)
      return outcome
    },
    [fetchPlan, key],
  )

  const getRepeatingIds = useCallback(async () => new Set((await plannerService.listTemplates()).filter((t) => t.recurrence !== 'once').map((t) => t.id)), [])

  const current = result && result.key === key ? result : null
  return {
    status: current ? current.status : 'loading',
    data: current?.data ?? null,
    error: current?.error ?? null,
    busy,
    run,
    getRepeatingIds,
    refresh: useCallback(() => setAttempt((n) => n + 1), []),
  }
}
