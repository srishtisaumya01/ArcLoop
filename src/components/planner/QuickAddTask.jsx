import { useState } from 'react'
import { Box, Button, TextField, Typography } from '@mui/material'
import { Plus } from 'lucide-react'
import { EMPTY_TASK, toTaskInput } from './taskForm.js'

// Quick add for My Day, like a to-do list: type the task and press Enter (or Add). Only the title is asked for; times, an
// estimate, a category, a description and priority can be set afterwards with Edit, and repeating tasks are made on the
// Recurring tasks page. Validation is the planner's own; its message is shown under the box.
//   onAdd(input) -> Promise<{ ok, error }>
export default function QuickAddTask({ busy, onAdd }) {
  const [title, setTitle] = useState('')
  const [problem, setProblem] = useState('')

  async function submit(e) {
    e.preventDefault()
    setProblem('')
    const { ok, error } = await onAdd(toTaskInput({ ...EMPTY_TASK, title }))
    if (ok) setTitle('')
    else setProblem(error?.details?.fields?.title ?? error?.message ?? 'We couldn’t add that task. Please try again.')
  }

  return (
    <Box component="form" onSubmit={submit} noValidate aria-label="Add a task" sx={{ display: 'grid', gap: 1.5 }}>
      <Typography variant="h3" component="h2">Add a task</Typography>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <TextField
          id="add-title"
          fullWidth
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What do you want to do?"
          slotProps={{ htmlInput: { 'aria-label': 'Task', maxLength: 120, enterKeyHint: 'done' } }}
          error={Boolean(problem)}
          helperText={problem || ' '}
        />
        <Button type="submit" variant="contained" disabled={busy} startIcon={<Plus size={18} aria-hidden="true" />} sx={{ flexShrink: 0, height: 56 }}>
          Add task
        </Button>
      </Box>
    </Box>
  )
}
