import { useCallback, useState } from 'react'
import { plannerService } from '../services/planner/index.js'
import { buildPlanCalendar } from '../utils/calendar/planCalendar.js'
import { downloadTextFile } from '../utils/download.js'

// Makes a calendar file of the upcoming plan and saves it on this device. Read-only: nothing in the plan changes and
// nothing leaves the browser except the request that reads the plan.
//   status: 'idle' | 'working' | 'done' | 'error'
//   result (when done): { filename, eventCount, untimedLeftOut, from, to, timeZone }, never the file's text
//   error (when failed): the service's own, person-safe message
export function useCalendarExport() {
  const [state, setState] = useState({ status: 'idle', result: null, error: null })

  const exportPlan = useCallback(async ({ days, includeUntimed, alertMinutes }) => {
    setState({ status: 'working', result: null, error: null })
    try {
      const plan = await plannerService.getCalendarPlan({ days })
      const { text, ...result } = buildPlanCalendar({ plan, options: { includeUntimed, alertMinutes }, now: Date.now() })
      downloadTextFile({ filename: result.filename, text, mime: 'text/calendar;charset=utf-8' })
      setState({ status: 'done', result, error: null })
    } catch (error) {
      setState({ status: 'error', result: null, error })
    }
  }, [])

  return { ...state, exportPlan }
}
