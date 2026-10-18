import { challengeClock } from '../utils/challengeClock.js'
import { FEATURED_CHALLENGE } from '../constants/landingContent.js'
import { useNow } from './useNow.js'

// The featured challenge's day counter and countdown, ticking every second. Null when it has no start date.
export function useChallengeClock(fixedNow) {
  const now = useNow(fixedNow)
  const challenge = FEATURED_CHALLENGE
  if (!challenge?.startDate) return null
  return { challenge, clock: challengeClock({ startDate: challenge.startDate, totalDays: challenge.durationDays }, now) }
}
