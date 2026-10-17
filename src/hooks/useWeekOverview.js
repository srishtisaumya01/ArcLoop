import { useCallback, useEffect, useState } from 'react'
import { plannerService } from '../services/planner/index.js'
import { PROFILE_CHANGED } from './profileEvents.js'

// Loads the Monday-to-Sunday overview for the week containing `weekOf` (default: the current
// week) through the planner service. While a week is being refreshed (retry, or the tab regaining
// focus so changes made elsewhere show up) the data already on screen stays visible; navigating
// to another week shows the loading state.
//   status: 'loading' | 'success' | 'error'   (an error after a success keeps `data`)
export function useWeekOverview(weekOf) {
  const key = weekOf ?? 'current'
  const [result, setResult] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    plannerService.getWeekSummary({ weekOf }).then(
      (data) => {
        if (!cancelled) setResult({ key, status: 'success', data, error: null })
      },
      (error) => {
        if (!cancelled) setResult((prev) => ({ key, status: 'error', data: prev?.key === key ? prev.data : null, error }))
      },
    )
    return () => {
      cancelled = true
    }
  }, [key, weekOf, attempt])

  // Pick up changes made in another tab or window when the user comes back.
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

  const refresh = useCallback(() => setAttempt((n) => n + 1), [])
  const current = result && result.key === key ? result : null
  return {
    status: current ? current.status : 'loading',
    data: current?.data ?? null,
    error: current?.error ?? null,
    refresh,
  }
}
