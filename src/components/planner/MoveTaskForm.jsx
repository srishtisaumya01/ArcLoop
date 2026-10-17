import { useState } from 'react'
import { Box, Button, TextField, Typography } from '@mui/material'
import { addDays } from '../../utils/planner/index.js'

// Moves a task to another day. The planner keeps the original on its own day (set aside as "moved")
// and creates a linked copy on the new day, so nothing is lost and the move can be undone.
export default function MoveTaskForm({ task, busy, onMove, onCancel }) {
  const [date, setDate] = useState(addDays(task.planDate, 1))
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!date) {
      setError('Choose a day.')
      return
    }
    const { ok, error: failure } = await onMove(task, date)
    if (ok) onCancel()
    else setError(failure?.message ?? 'That didn’t move. Please try again.')
  }

  return (
    <Box component="form" onSubmit={submit} noValidate aria-label={`Move ${task.title}`} sx={{ display: 'grid', gap: 1.5 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'flex-start' }}>
        <TextField size="small" type="date" label="Move to" value={date} onChange={(e) => setDate(e.target.value)} error={Boolean(error)} helperText={error} slotProps={{ inputLabel: { shrink: true } }} />
        <Button type="submit" size="small" variant="contained" disabled={busy}>Move task</Button>
        <Button size="small" disabled={busy} onClick={onCancel}>Cancel</Button>
      </Box>
      <Typography variant="body2" color="text.secondary">
        The task stays on this day as “moved”, with anything you already did. A fresh copy appears on the new day. You can undo the move.
      </Typography>
    </Box>
  )
}
