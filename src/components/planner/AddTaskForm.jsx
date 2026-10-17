import { useState } from 'react'
import { Box, Button, FormControlLabel, FormGroup, Checkbox, MenuItem, TextField, Typography } from '@mui/material'
import { Plus } from 'lucide-react'
import TaskFields from './TaskFields.jsx'
import { EMPTY_TASK, toTaskInput } from './taskForm.js'

const WEEKDAYS = [
  [1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun'],
]

// Adds a task to the day: just this day, every day, or selected days of the week. Validation is the
// planner's own; its messages are shown per field.
export default function AddTaskForm({ busy, onAdd }) {
  const [values, setValues] = useState(EMPTY_TASK)
  const [repeat, setRepeat] = useState('once')
  const [weekdays, setWeekdays] = useState([])
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')

  const toggleDay = (day) => setWeekdays((list) => (list.includes(day) ? list.filter((d) => d !== day) : [...list, day]))

  async function submit(e) {
    e.preventDefault()
    setErrors({})
    setMessage('')
    const { ok, error } = await onAdd({ ...toTaskInput(values), recurrence: repeat, weekdays: repeat === 'weekly' ? weekdays : null })
    if (ok) {
      setValues(EMPTY_TASK)
      setRepeat('once')
      setWeekdays([])
    } else if (error?.details?.fields) setErrors(error.details.fields)
    else setMessage(error?.message ?? 'We couldn’t add that task. Please try again.')
  }

  return (
    <Box component="form" onSubmit={submit} noValidate aria-label="Add a task" sx={{ display: 'grid', gap: 2 }}>
      <Typography variant="h3" component="h2">Add a task</Typography>
      <TaskFields idPrefix="add" values={values} errors={errors} onChange={setValues} />
      <TextField select label="Repeats" value={repeat} onChange={(e) => setRepeat(e.target.value)} error={Boolean(errors.recurrence)} helperText={errors.recurrence}>
        <MenuItem value="once">Just this day</MenuItem>
        <MenuItem value="daily">Every day</MenuItem>
        <MenuItem value="weekly">Selected days of the week</MenuItem>
      </TextField>
      {repeat === 'weekly' && (
        <Box role="group" aria-label="Days of the week">
          <FormGroup row>
            {WEEKDAYS.map(([day, label]) => (
              <FormControlLabel key={day} control={<Checkbox checked={weekdays.includes(day)} onChange={() => toggleDay(day)} />} label={label} />
            ))}
          </FormGroup>
          {errors.weekdays && <Typography variant="body2" color="error">{errors.weekdays}</Typography>}
        </Box>
      )}
      {repeat !== 'once' && <Typography variant="body2" color="text.secondary">Repeating tasks start on this day and show up on later days automatically.</Typography>}
      {message && <Typography role="alert" color="error">{message}</Typography>}
      <Box>
        <Button type="submit" variant="contained" disabled={busy} startIcon={<Plus size={18} aria-hidden="true" />}>
          Add task
        </Button>
      </Box>
    </Box>
  )
}
