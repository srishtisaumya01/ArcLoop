import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, TextField, Typography } from '@mui/material'
import { ROUTES } from '../../constants/navigation.js'

// Optional reminder for one task. Nothing is set unless the user chooses a time here.
export default function TaskReminderControl({ task, reminder, remindersOn, busy, onSet, onRemove }) {
  const [editing, setEditing] = useState(false)
  const [time, setTime] = useState('')
  const [error, setError] = useState('')

  const open = () => {
    setTime(reminder?.remindTime ?? task.plannedStart ?? '09:00')
    setError('')
    setEditing(true)
  }
  async function save(e) {
    e.preventDefault()
    setError('')
    const { ok, error: failure } = await onSet(task, time)
    if (ok) setEditing(false)
    else setError(failure?.details?.fields?.remindTime ?? failure?.message ?? 'That didn’t save. Please try again.')
  }
  async function remove() {
    setError('')
    const { ok, error: failure } = await onRemove(task)
    if (ok) setEditing(false)
    else setError(failure?.message ?? 'That didn’t save. Please try again.')
  }

  if (!editing) {
    return (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
        <Button size="small" disabled={busy} onClick={open} aria-label={reminder ? `Change reminder for ${task.title}` : `Set a reminder for ${task.title}`}>
          {reminder ? `Reminder at ${reminder.remindTime}` : 'Remind me'}
        </Button>
        {reminder && !remindersOn && (
          <Typography variant="body2" color="text.secondary">
            Reminders are off, so this one won’t be sent. <RouterLink to={ROUTES.reminders}>Reminder settings</RouterLink>
          </Typography>
        )}
      </Box>
    )
  }
  return (
    <Box component="form" onSubmit={save} noValidate aria-label={`Reminder for ${task.title}`} sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'flex-start' }}>
      <TextField size="small" type="time" label="Remind me at" value={time} onChange={(e) => setTime(e.target.value)} error={Boolean(error)} helperText={error} slotProps={{ inputLabel: { shrink: true } }} />
      <Button type="submit" size="small" variant="contained" disabled={busy}>Save reminder</Button>
      {reminder && <Button size="small" color="error" disabled={busy} onClick={remove}>Remove reminder</Button>}
      <Button size="small" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button>
    </Box>
  )
}
