import { useEffect, useState } from 'react'

// The current time, refreshed every second while the component is on screen. Pass `fixed` to freeze it (tests, previews).
export function useNow(fixed) {
  const [now, setNow] = useState(() => fixed ?? new Date())
  useEffect(() => {
    if (fixed) return undefined
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [fixed])
  return fixed ?? now
}
