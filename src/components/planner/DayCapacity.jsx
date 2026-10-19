import { useEffect, useRef, useState } from 'react'
import { Box, Button, LinearProgress, TextField, Typography } from '@mui/material'
import { Gauge } from 'lucide-react'
import { useDismissible } from '../../hooks/useDismissible.js'
import { AVAILABLE_CHOICES, capacitySignature, capacityStatus, describeCapacity, describeSuggestion, suggestMoves } from './capacity.js'
import { formatMinutes } from './weekFormat.js'
import { colors, radii } from '../../theme/tokens.js'

// How full the day is: the time its tasks take against the time the person has for them (their own number, kept in this browser). When
// the day holds more, a gentle suggestion names the lowest-priority tasks that could move to the next day. It only suggests: tasks move
// when the button is pressed, each one undoable, and "Not now" hides the suggestion for this day until something changes.
//   tasks: the day's tasks    available / onChangeAvailable: minutes, and a setter    date: the day on screen
//   canMove: whether tasks can be moved from here    nextLabel: where they would go (or null when there is no next day to plan)
//   onMove(ids) -> outcome    getRepeatingIds() -> Set (a repeating task is never suggested)    notice: words about the last move
export default function DayCapacity({ date, tasks, available, onChangeAvailable, canMove, nextLabel, busy, onMove, getRepeatingIds, notice }) {
  const status = capacityStatus({ tasks, availableMinutes: available })
  const over = status.state === 'over'
  const [repeating, setRepeating] = useState(null) // the ids of the really repeating templates, asked for only when the day is over
  const ask = useRef(getRepeatingIds) // the page makes a new function on every render; only the first request matters
  useEffect(() => {
    if (!over || !canMove || repeating) return undefined
    let cancelled = false
    ask.current().then((ids) => !cancelled && setRepeating(ids), () => !cancelled && setRepeating(new Set())) // if unknown, nothing is treated as repeating
    return () => { cancelled = true }
  }, [over, canMove, repeating])
  const suggestion = over && canMove && repeating ? suggestMoves({ tasks, over: status.over, repeatingIds: repeating }) : { tasks: [], minutes: 0, enough: true }
  const [dismissed, dismiss] = useDismissible(`capacity:${date}:${capacitySignature(status, suggestion)}`)
  if (status.state === 'empty' && status.unknown === 0) return null
  const ratio = status.available > 0 ? Math.min(100, Math.round((status.minutes / status.available) * 100)) : 0
  const showSuggestion = over && canMove && repeating && nextLabel && !dismissed
  return (
    <Box component="section" aria-label="Day capacity" sx={{ p: 2.5, borderRadius: `${radii.lg}px`, bgcolor: colors.bgAlt, border: `1px solid ${colors.border}`, display: 'grid', gap: 1.25 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <Gauge size={20} aria-hidden="true" />
        <Typography variant="h4" component="h2">Time for this day</Typography>
      </Box>
      <LinearProgress variant="determinate" value={ratio} color={over ? 'warning' : 'primary'} aria-label={`Planned time: ${ratio} percent of the time available`} sx={{ height: 8, borderRadius: 4 }} />
      <Typography>{describeCapacity(status)}</Typography>
      <TextField select size="small" label="Time you have for tasks" value={available} onChange={(e) => onChangeAvailable(Number(e.target.value))}
        slotProps={{ select: { native: true } }} helperText="Your own number. It is kept in this browser and only used for this look." sx={{ maxWidth: 320 }}>
        {AVAILABLE_CHOICES.map((m) => <option key={m} value={m}>{formatMinutes(m)}</option>)}
      </TextField>
      {notice && <Typography role="status" variant="body2" color="text.secondary">{notice}</Typography>}
      {showSuggestion && (
        <Box sx={{ display: 'grid', gap: 1 }}>
          <Typography>{describeSuggestion({ suggestion, nextLabel })}</Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {suggestion.tasks.length > 0 && (
              <Button variant="contained" size="small" disabled={busy} onClick={() => onMove(suggestion.tasks.map((t) => t.id))}>
                {`Move ${suggestion.tasks.length} to ${nextLabel}`}
              </Button>
            )}
            <Button size="small" onClick={dismiss}>Not now</Button>
          </Box>
          <Typography variant="body2" color="text.secondary">Nothing moves unless you press the button, and each move can be undone.</Typography>
        </Box>
      )}
    </Box>
  )
}
