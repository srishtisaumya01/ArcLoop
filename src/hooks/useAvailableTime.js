import { useCallback, useState } from 'react'
import { DEFAULT_AVAILABLE_MINUTES, isAvailableMinutes } from '../components/planner/capacity.js'

// The time the person has for a day's tasks, kept in this browser only (like the dismissed notes and the focus log: nothing is sent to the
// server). If storage is unavailable the choice still holds for the visit and is simply not remembered.
const storageKey = (userId) => `arcloop.capacity.available.${userId}`

export function readAvailable(userId, storage) {
  try {
    const value = Number(storage?.getItem(storageKey(userId)))
    return isAvailableMinutes(value) ? value : DEFAULT_AVAILABLE_MINUTES
  } catch {
    return DEFAULT_AVAILABLE_MINUTES
  }
}

const browserStorage = () => {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

//   const [available, setAvailable] = useAvailableTime(user?.id)
export function useAvailableTime(userId) {
  const [chosen, setChosen] = useState(() => readAvailable(userId, browserStorage()))
  const set = useCallback((minutes) => {
    if (!isAvailableMinutes(minutes)) return
    setChosen(minutes)
    try {
      browserStorage()?.setItem(storageKey(userId), String(minutes))
    } catch {
      // Not remembered across visits.
    }
  }, [userId])
  return [chosen, set]
}
