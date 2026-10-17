import { useCallback, useEffect, useState } from 'react'
import { plannerService } from '../services/planner/index.js'
import { PROFILE_CHANGED } from './profileEvents.js'
import { groupRecurringTemplates } from '../utils/planner/index.js'

// Loads the user's repeating tasks (active, not started yet, ended) through the planner service and
// runs changes against them. Every change reloads the list, so the screen always shows what is stored.
//   status: 'loading' | 'success' | 'error'   (an error after a success keeps `data`)
//   run(fn): runs a service change, reloads, and resolves { ok, result, error } (never throws)
export function useRecurringTasks() {
  const [state, setState] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)

  const fetchAll = useCallback(async () => {
    const [{ today }, templates] = await Promise.all([plannerService.getToday(), plannerService.listTemplates({ includeArchived: true })])
    return { today, groups: groupRecurringTemplates(templates, today) }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchAll().then(
      (data) => !cancelled && setState({ status: 'success', data, error: null }),
      (error) => !cancelled && setState((prev) => ({ status: 'error', data: prev?.data ?? null, error })),
    )
    return () => {
      cancelled = true
    }
  }, [fetchAll, attempt])

  useEffect(() => {
    const again = () => setAttempt((n) => n + 1)
    const onVisible = () => document.visibilityState === 'visible' && again()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(PROFILE_CHANGED, again) // a new timezone changes what "today" is
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(PROFILE_CHANGED, again)
    }
  }, [])

  const run = useCallback(
    async (change) => {
      setBusy(true)
      let outcome
      try {
        outcome = { ok: true, result: await change(plannerService), error: null }
      } catch (error) {
        outcome = { ok: false, result: null, error }
      }
      try {
        setState({ status: 'success', data: await fetchAll(), error: null })
      } catch (error) {
        setState((prev) => ({ status: 'error', data: prev?.data ?? null, error }))
      }
      setBusy(false)
      return outcome
    },
    [fetchAll],
  )

  return {
    status: state ? state.status : 'loading',
    data: state?.data ?? null,
    error: state?.error ?? null,
    busy,
    run,
    refresh: useCallback(() => setAttempt((n) => n + 1), []),
  }
}
