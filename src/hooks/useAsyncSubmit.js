import { useCallback, useRef, useState } from 'react'

// Wraps an async submit handler: tracks idle/loading/success/error, ignores
// duplicate submissions while one is in flight, and keeps the error message.
export function useAsyncSubmit(action) {
  const [state, setState] = useState({ status: 'idle', error: null, result: null })
  const pending = useRef(false)

  const submit = useCallback(
    async (values) => {
      if (pending.current) return
      pending.current = true
      setState({ status: 'loading', error: null, result: null })
      try {
        const result = await action(values)
        setState({ status: 'success', error: null, result })
      } catch (error) {
        setState({ status: 'error', error: error?.message || 'Something went wrong. Please try again.', result: null })
      } finally {
        pending.current = false
      }
    },
    [action],
  )

  const reset = useCallback(() => setState({ status: 'idle', error: null, result: null }), [])

  return { ...state, submit, reset }
}
