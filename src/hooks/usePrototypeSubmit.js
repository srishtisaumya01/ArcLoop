import { useCallback, useEffect, useRef, useState } from 'react'

// UI-ONLY. Simulates a pending request so loading/finished states can be
// designed. It performs no network call and saves nothing. Replace with real
// service calls when Supabase is integrated (Phase 3).
export function usePrototypeSubmit(delayMs = 800) {
  const [status, setStatus] = useState('idle') // idle | loading | done
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const submit = useCallback(() => {
    if (timer.current) return // ignore duplicate submissions while pending
    setStatus('loading')
    timer.current = setTimeout(() => {
      timer.current = null
      setStatus('done')
    }, delayMs)
  }, [delayMs])

  const reset = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = null
    setStatus('idle')
  }, [])

  return { status, submit, reset }
}
