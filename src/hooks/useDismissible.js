import { useCallback, useState } from 'react'

const storageKey = (key) => `arcloop.dismissed.${key}`
const read = (key) => {
  try {
    return localStorage.getItem(storageKey(key)) === '1'
  } catch {
    return false
  }
}

// Remembers (in this browser only) that a gentle note was dismissed. The key says what was dismissed,
// e.g. the day or week the note was shown for, so a note for a new day is not hidden by an old
// dismissal. Storage is a convenience: if it is unavailable the note is still hidden for this visit
// and simply comes back on the next one.
//   const [dismissed, dismiss] = useDismissible('welcomeBack:2026-03-10')
export function useDismissible(key) {
  const [thisVisit, setThisVisit] = useState(() => new Set())
  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(storageKey(key), '1')
    } catch {
      // Not remembered across visits.
    }
    setThisVisit((keys) => new Set(keys).add(key))
  }, [key])
  return [thisVisit.has(key) || read(key), dismiss]
}
