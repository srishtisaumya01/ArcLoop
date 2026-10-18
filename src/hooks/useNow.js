import { useEffect, useState } from 'react'

// The current time, refreshed every `intervalMs` (every second by default) while the component is on screen.
// Pass `fixed` to freeze it (tests, previews).
export function useNow(fixed, intervalMs = 1000) {
  const [now, setNow] = useState(() => fixed ?? new Date())
  useEffect(() => {
    if (fixed) return undefined
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [fixed, intervalMs])
  return fixed ?? now
}
