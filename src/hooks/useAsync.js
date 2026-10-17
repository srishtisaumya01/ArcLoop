import { useCallback, useEffect, useState } from 'react'

// Runs an async function and exposes { status, data, error, retry }.
// `fn` must be stable (wrap in useCallback); a new `fn` or a retry starts a new
// load. Status is derived, so there is no synchronous setState inside the effect.
export function useAsync(fn) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)

  useEffect(() => {
    let cancelled = false
    fn().then(
      (data) => !cancelled && setResult({ fn, attempt, status: 'success', data }),
      (error) => !cancelled && setResult({ fn, attempt, status: 'error', error }),
    )
    return () => {
      cancelled = true
    }
  }, [fn, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  const current = result && result.fn === fn && result.attempt === attempt ? result : null

  return {
    status: current ? current.status : 'loading',
    data: current?.data ?? null,
    error: current?.error ?? null,
    retry,
  }
}
