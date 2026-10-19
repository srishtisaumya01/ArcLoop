import { Box, Typography } from '@mui/material'
import { colors } from '../../theme/tokens.js'
import { scheduleMarkers } from './scheduleMarkers.js'

const listSx = { listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }

// The day's open tasks as a schedule: the ones with a time, in time order, apart from the ones that can happen any time. A day with no
// times set is the plain list it has always been. The tasks come already in the planner's display order (timed first, by start time).
//   renderTask(task, marker) -> the task card (a <li>)
export default function DaySchedule({ tasks, nowMinutes, renderTask }) {
  const scheduled = tasks.filter((t) => t.plannedStart)
  const anytime = tasks.filter((t) => !t.plannedStart)
  if (scheduled.length === 0) {
    return <Box component="ul" aria-label="Today’s tasks" sx={listSx}>{tasks.map((t) => renderTask(t, null))}</Box>
  }
  const markers = scheduleMarkers(scheduled, nowMinutes)
  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      <Box component="section" aria-label="Scheduled">
        <Typography variant="h4" component="h2" sx={{ mb: 1 }}>Scheduled</Typography>
        <Box component="ul" aria-label="Scheduled tasks" sx={listSx}>{scheduled.map((t) => renderTask(t, markers.get(t.id) ?? null))}</Box>
      </Box>
      {anytime.length > 0 && (
        <Box component="section" aria-label="Anytime">
          <Typography variant="h4" component="h2" sx={{ mb: 1, color: colors.textSecondary }}>Anytime</Typography>
          <Box component="ul" aria-label="Unscheduled tasks" sx={listSx}>{anytime.map((t) => renderTask(t, null))}</Box>
        </Box>
      )}
    </Box>
  )
}
