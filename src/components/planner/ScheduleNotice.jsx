import { Box, Button, Typography } from '@mui/material'
import { CalendarClock } from 'lucide-react'
import { useDismissible } from '../../hooks/useDismissible.js'
import { checkSignature, describeChecks, hasFindings } from './scheduleChecks.js'
import { colors, radii } from '../../theme/tokens.js'

// A calm note above the schedule when two tasks overlap, or the day holds more than the time left. It only points things out: each task
// keeps its time until the person changes it (Change time or Move on the task). "Not now" hides this note for this day until something
// new is found. Nothing is blocked and nothing is saved here.
//   checks: the result of checkSchedule()    date: the day on screen
export default function ScheduleNotice({ date, checks }) {
  const signature = checkSignature(checks)
  const [dismissed, dismiss] = useDismissible(`scheduleCheck:${date}:${signature}`)
  if (!hasFindings(checks) || dismissed) return null
  const lines = describeChecks(checks)
  const shown = lines.slice(0, 4)
  return (
    <Box component="section" aria-label="Schedule check" sx={{ p: 2.5, borderRadius: `${radii.lg}px`, bgcolor: colors.bgAlt, border: `1px solid ${colors.border}`, display: 'grid', gap: 1.25 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <CalendarClock size={20} aria-hidden="true" />
        <Typography variant="h4" component="h2">A look at this schedule</Typography>
      </Box>
      <Box component="ul" sx={{ m: 0, pl: 3, display: 'grid', gap: 0.5 }}>
        {shown.map((line) => <li key={line}>{line}</li>)}
      </Box>
      {lines.length > shown.length && <Typography variant="body2" color="text.secondary">And {lines.length - shown.length} more.</Typography>}
      <Typography variant="body2" color="text.secondary">Nothing has changed. Use Change time or Move on a task if you want to sort it out.</Typography>
      <Box>
        <Button size="small" onClick={dismiss}>Not now</Button>
      </Box>
    </Box>
  )
}
