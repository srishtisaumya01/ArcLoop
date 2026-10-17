import { useCallback, useEffect, useState } from 'react'
import { plannerService } from '../services/planner/index.js'
import { PROFILE_CHANGED } from './profileEvents.js'
import { classifyDate } from '../utils/planner/index.js'

// Loads one day's plan through the planner service and runs changes against it.
// Today and the editable past are opened (created and topped up from templates); future days and
// read-only history are only read, so browsing never creates rows by accident. `start` opens a
// future day on purpose.
//   status: 'loading' | 'success' | 'error'    (an error after a success keeps `data`)
//   run(fn): runs a service change, reloads the day, and resolves { ok, error } (never throws)
export function useDayPlan(date) {
  const key = date ?? 'today'
  const [result, setResult] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)

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
      let outcome = { ok: true, error: null }
      try {
        await change(plannerService)
      } catch (error) {
        outcome = { ok: false, error }
      }
      try {
        const data = await fetchPlan({ open })
        setResult({ key, status: 'success', data, error: null })
      } catch (error) {
        setResult((prev) => ({ key, status: 'error', data: prev?.key === key ? prev.data : null, error }))
      }
      setBusy(false)
      return outcome
    },
    [fetchPlan, key],
  )

  const current = result && result.key === key ? result : null
  return {
    status: current ? current.status : 'loading',
    data: current?.data ?? null,
    error: current?.error ?? null,
    busy,
    run,
    refresh: useCallback(() => setAttempt((n) => n + 1), []),
  }
}
