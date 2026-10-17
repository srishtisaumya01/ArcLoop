import { Box, Button, Chip, IconButton, Typography } from '@mui/material'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatRange } from './weekFormat.js'

// Previous / next week controls with the range in between. `canGoNext` is false past the
// planning horizon so the user is not sent to weeks the planner will not hold.
export default function WeekNavigator({ weekStart, weekEnd, isCurrentWeek, canGoNext, onPrevious, onNext, onToday }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
      <IconButton aria-label="Previous week" onClick={onPrevious} size="small">
        <ChevronLeft size={20} aria-hidden="true" />
      </IconButton>
      <Typography component="h2" variant="h3" aria-live="polite" sx={{ minWidth: { sm: 260 } }}>
        {formatRange(weekStart, weekEnd)}
      </Typography>
      <IconButton aria-label="Next week" onClick={onNext} disabled={!canGoNext} size="small">
        <ChevronRight size={20} aria-hidden="true" />
      </IconButton>
      {isCurrentWeek ? (
        <Chip label="This week" color="primary" size="small" />
      ) : (
        <Button size="small" variant="outlined" onClick={onToday}>
          Back to this week
        </Button>
      )}
    </Box>
  )
}
