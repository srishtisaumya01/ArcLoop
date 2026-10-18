import { useEffect } from 'react'
import { useAsync } from './useAsync.js'
import { CHALLENGES_CHANGED, listMyChallenges } from '../services/myChallengesService.js'
import { challengeClock } from '../utils/challengeClock.js'

const dayCount = (e) => Math.round((new Date(e.end_date) - new Date(e.start_date)) / 86_400_000) + 1

// The challenges the person is in, each with where it stands today. `ongoing` is the ones running or about to start.
//   status: 'loading' | 'success' | 'error'
export function useMyChallenges() {
  const { status, data, retry } = useAsync(listMyChallenges)
  useEffect(() => {
    window.addEventListener(CHALLENGES_CHANGED, retry)
    return () => window.removeEventListener(CHALLENGES_CHANGED, retry)
  }, [retry])
  const now = new Date()
  const items = (data?.results ?? []).map((c) => ({ ...c, clock: challengeClock({ startDate: c.enrollment.start_date, totalDays: dayCount(c.enrollment) }, now) }))
  return { status, retry, items, ongoing: items.filter((c) => c.clock.status !== 'ended'), finished: items.filter((c) => c.clock.status === 'ended') }
}
