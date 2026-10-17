import { useCallback, useEffect, useState } from 'react'
import { plannerService } from '../services/planner/index.js'
import { PROFILE_CHANGED } from './profileEvents.js'
import { addDays, startOfWeek } from '../utils/planner/index.js'

export const PROGRESS_WEEKS = 8
export const HABIT_WINDOW_DAYS = 28

// Loads the progress overview from the planner service: the last few weeks (each one the same
// weekly summary the Weekly Overview shows) and how each repeating task has gone. Nothing is
// recomputed here. Newest week first.
//   status: 'loading' | 'success' | 'error'     refresh(): load again
export function useProgressOverview() {
  const [state, setState] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { today } = await plannerService.getToday()
      const thisWeek = startOfWeek(today)
      const starts = Array.from({ length: PROGRESS_WEEKS }, (_, i) => addDays(thisWeek, -7 * i))
      const [weeks, habits] = await Promise.all([
        Promise.all(starts.map((weekOf) => plannerService.getWeekSummary({ weekOf }))),
        plannerService.getHabitProgress({ days: HABIT_WINDOW_DAYS }),
      ])
      return { weeks, habits }
    })().then(
      (data) => !cancelled && setState({ status: 'success', data, error: null }),
      (error) => !cancelled && setState((prev) => ({ status: 'error', data: prev?.data ?? null, error })),
    )
    return () => {
      cancelled = true
    }
  }, [attempt])

  useEffect(() => {
    const again = () => setAttempt((n) => n + 1)
    const onVisible = () => document.visibilityState === 'visible' && again()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(PROFILE_CHANGED, again)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(PROFILE_CHANGED, again)
    }
  }, [])

  return {
    status: state ? state.status : 'loading',
    data: state?.data ?? null,
    error: state?.error ?? null,
    refresh: useCallback(() => setAttempt((n) => n + 1), []),
  }
}
