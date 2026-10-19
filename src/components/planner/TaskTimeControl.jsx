import { useState } from 'react'
import { Box, Button, TextField, Typography } from '@mui/material'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { parseTime } from '../../utils/planner/index.js'
import { clockText } from './scheduleChecks.js'
import { colors, radii } from '../../theme/tokens.js'

const STEP = 15 // minutes
const LAST_MINUTE = 24 * 60 - 1

// A quick way to give a task a time, change it or take it away, for a phone as much as a desktop: the device's own time pickers, and two buttons
// that move the whole block 15 minutes earlier or later (no dragging). The planner checks the times (an end needs a start, and comes after
// it) and its message is shown here. Only the times change: the task keeps its id, day, progress, priority and everything else.
//   onSave({ plannedStart, plannedEnd }) -> Promise<{ ok, error }>    onClose(): leave the control
export default function TaskTimeControl({ task, busy, onSave, onClose }) {
  const [start, setStart] = useState(task.plannedStart ?? '')
  const [end, setEnd] = useState(task.plannedEnd ?? '')
  const [problem, setProblem] = useState('')
  const [working, setWorking] = useState(false)
  const scheduled = Boolean(task.plannedStart)
  const off = busy || working

  async function save(times, { close = true } = {}) {
    setWorking(true)
    setProblem('')
    const { ok, error } = await onSave(times)
    setWorking(false)
    if (!ok) {
      const fields = error?.details?.fields
      setProblem(fields?.plannedStart ?? fields?.plannedEnd ?? error?.message ?? 'That didn’t save. Please try again.')
      return
    }
    if (close) onClose()
  }

  // The saved block, moved by `minutes`; null when it would leave the day.
  const shifted = (minutes) => {
    if (!scheduled) return null
    const from = parseTime(task.plannedStart) + minutes
    const to = task.plannedEnd ? parseTime(task.plannedEnd) + minutes : null
    if (from < 0 || (to ?? from) > LAST_MINUTE) return null
    return { plannedStart: clockText(from), plannedEnd: to === null ? null : clockText(to) }
  }
  const earlier = shifted(-STEP)
  const later = shifted(STEP)

  return (
    <Box component="form" noValidate aria-label={`Time for ${task.title}`} onSubmit={(e) => { e.preventDefault(); save({ plannedStart: start || null, plannedEnd: end || null }) }}
      sx={{ display: 'grid', gap: 1.5, p: 2, borderRadius: `${radii.md}px`, border: `1px solid ${colors.border}`, bgcolor: colors.bgAlt }}>
      {scheduled && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
          <Typography component="span" sx={{ fontWeight: 600 }}>Shift the block</Typography>
          <Button size="small" variant="outlined" disabled={off || !earlier} startIcon={<ChevronLeft size={16} aria-hidden="true" />}
            aria-label={`Move ${task.title} ${STEP} minutes earlier`} onClick={() => save(earlier, { close: false })}>{STEP} min earlier</Button>
          <Button size="small" variant="outlined" disabled={off || !later} endIcon={<ChevronRight size={16} aria-hidden="true" />}
            aria-label={`Move ${task.title} ${STEP} minutes later`} onClick={() => save(later, { close: false })}>{STEP} min later</Button>
        </Box>
      )}
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        <TextField label="Start time" type="time" size="small" value={start} onChange={(e) => setStart(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField label="End time (optional)" type="time" size="small" value={end} onChange={(e) => setEnd(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
      </Box>
      {problem && <Typography role="alert" color="error">{problem}</Typography>}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        <Button type="submit" variant="contained" size="small" disabled={off}>Save time</Button>
        {scheduled && <Button size="small" disabled={off} onClick={() => save({ plannedStart: null, plannedEnd: null })}>Remove the time</Button>}
        <Button size="small" onClick={onClose} disabled={working}>Close</Button>
      </Box>
    </Box>
  )
}
