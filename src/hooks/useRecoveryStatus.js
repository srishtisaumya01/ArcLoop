import { useEffect, useState } from 'react'
import { plannerService } from '../services/planner/index.js'

// Whether the person is returning after a missed planned day (decided by the planner's own rules in
// the service). Re-checked whenever `plan` changes, so the note goes away as soon as they make
// progress today. Failure just means no note: it is never worth an error message.
export function useRecoveryStatus(plan, enabled) {
  const [returning, setReturning] = useState(false)
  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    plannerService.getRecoveryStatus().then(
      (status) => !cancelled && setReturning(status.returning),
      () => {},
    )
    return () => {
      cancelled = true
    }
  }, [plan, enabled])
  return enabled && returning
}
