import { useState } from 'react'
import { Box, Button, Typography } from '@mui/material'
import { Plus } from 'lucide-react'
import RepeatFields from './RepeatFields.jsx'
import TaskFields from './TaskFields.jsx'
import { EMPTY_TASK, toTaskInput } from './taskForm.js'

// The full add form: every task field and how often it repeats. Used for repeating tasks on the Recurring tasks page
// (`allowOnce={false}`: every day or selected days); My Day has the quick add instead. Validation is the planner's own;
// its messages are shown per field.
export default function AddTaskForm({ busy, onAdd, title = 'Add a task', submitLabel = 'Add task', allowOnce = true }) {
  const first = allowOnce ? 'once' : 'daily'
  const [values, setValues] = useState(EMPTY_TASK)
  const [repeat, setRepeat] = useState(first)
  const [weekdays, setWeekdays] = useState([])
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')

  async function submit(e) {
    e.preventDefault()
    setErrors({})
    setMessage('')
    const { ok, error } = await onAdd({ ...toTaskInput(values), recurrence: repeat, weekdays: repeat === 'weekly' ? weekdays : null })
    if (ok) {
      setValues(EMPTY_TASK)
      setRepeat(first)
      setWeekdays([])
    } else if (error?.details?.fields) setErrors(error.details.fields)
    else setMessage(error?.message ?? 'We couldn’t add that task. Please try again.')
  }

  return (
    <Box component="form" onSubmit={submit} noValidate aria-label={title} sx={{ display: 'grid', gap: 2 }}>
      <Typography variant="h3" component="h2">{title}</Typography>
      <TaskFields idPrefix="add" values={values} errors={errors} onChange={setValues} />
      <RepeatFields allowOnce={allowOnce} repeat={repeat} weekdays={weekdays} onRepeat={setRepeat} onWeekdays={setWeekdays} errors={errors} />
      {repeat !== 'once' && <Typography variant="body2" color="text.secondary">Repeating tasks start on this day and show up on later days automatically.</Typography>}
      {message && <Typography role="alert" color="error">{message}</Typography>}
      <Box>
        <Button type="submit" variant="contained" disabled={busy} startIcon={<Plus size={18} aria-hidden="true" />}>
          {submitLabel}
        </Button>
      </Box>
    </Box>
  )
}
