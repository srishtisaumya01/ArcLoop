import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Typography } from '@mui/material'
import { ROUTES } from '../../constants/navigation.js'
import { colors, radii } from '../../theme/tokens.js'
import { completionLabel, describeDay, EXCLUDED_LABEL, formatDay, formatMinutes, weekdayName } from './weekFormat.js'

function TaskList({ title, tasks, setAside }) {
  return (
    <Box component="section" sx={{ mt: 2 }}>
      <Typography variant="h4" component="h4" sx={{ mb: 1 }}>{title}</Typography>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
        {tasks.map((t) => (
          <Box component="li" key={t.id} sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Typography sx={{ overflowWrap: 'anywhere' }}>
              {t.title}
              {t.isPriority ? ' (priority)' : ''}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {setAside ? EXCLUDED_LABEL[t.excludedReason] ?? 'Set aside' : completionLabel(t.completion)}
              {t.plannedStart ? ` · ${t.plannedStart}` : ''}
              {t.estimatedMinutes ? ` · ${formatMinutes(t.estimatedMinutes)}` : ''}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

// Read-only plan for the selected day; editing happens in My Day.
export default function DayDetail({ entry }) {
  const { label, detail } = describeDay(entry)
  return (
    <Box component="section" aria-label={`${weekdayName(entry.date)} ${formatDay(entry.date)} plan`} sx={{ p: 3, borderRadius: `${radii.lg}px`, border: `1px solid ${colors.border}`, bgcolor: colors.surface }}>
      <Typography variant="h3" component="h3">{weekdayName(entry.date)}, {formatDay(entry.date)}</Typography>
      <Typography color="text.secondary">{label}. {detail}</Typography>
      {entry.tasks.length > 0 && <TaskList title="Plan" tasks={entry.tasks} />}
      {entry.setAside.length > 0 && <TaskList title="Set aside or moved" tasks={entry.setAside} setAside />}
      {entry.tasks.length === 0 && entry.setAside.length === 0 && (
        <Typography sx={{ mt: 2 }}>{entry.kind === 'no_record' ? 'No plan was recorded for this day.' : 'There are no tasks on this day.'}</Typography>
      )}
      <Button component={RouterLink} to={`${ROUTES.day}?date=${entry.date}`} variant="contained" size="small" sx={{ mt: 3 }}>
        Open in My Day
      </Button>
    </Box>
  )
}
