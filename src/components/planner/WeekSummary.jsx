import { Box, Typography } from '@mui/material'
import { colors, radii } from '../../theme/tokens.js'
import { formatMinutes } from './weekFormat.js'

function Stat({ label, value, hint }) {
  return (
    <Box sx={{ p: 2, borderRadius: `${radii.md}px`, border: `1px solid ${colors.border}`, bgcolor: colors.surface }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="h3" component="p" sx={{ mt: 0.5 }}>{value}</Typography>
      {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
    </Box>
  )
}

// Weekly summary cards. The average is shown only once enough days have a plan; rest days and
// days that have not happened yet never enter it.
export default function WeekSummary({ week, minDays }) {
  const upcomingHint = week.upcomingTasks
    ? [week.upcomingEstimatedMinutes ? `about ${formatMinutes(week.upcomingEstimatedMinutes)} estimated` : null, week.upcomingMissingEstimates ? `${week.upcomingMissingEstimates} without an estimate` : null].filter(Boolean).join(', ')
    : undefined
  return (
    <Box component="section" aria-label="Week summary">
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)', lg: 'repeat(6, 1fr)' } }}>
        <Stat label="Days with a plan" value={week.daysWithPlan} hint={week.restDays ? `${week.restDays} rest` : undefined} />
        <Stat label="Days with progress" value={week.daysWithProgress} />
        <Stat label="Tasks completed" value={week.tasksDone} hint={week.tasksPartial ? `${week.tasksPartial} partly done` : undefined} />
        <Stat label="Tasks remaining" value={week.tasksRemaining} hint="on days so far" />
        <Stat label="Coming up" value={week.upcomingTasks} hint={upcomingHint} />
        <Stat label="Average completion" value={week.eligible && week.averagePercent !== null ? `${week.averagePercent}%` : '—'} hint={week.eligible ? 'planned days, rest days excluded' : `appears once at least ${minDays} days have a plan`} />
      </Box>
    </Box>
  )
}
