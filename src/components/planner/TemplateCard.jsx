import { useState } from 'react'
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Typography } from '@mui/material'
import { colors, radii } from '../../theme/tokens.js'
import RepeatFields from './RepeatFields.jsx'
import TaskFields from './TaskFields.jsx'
import { editSummary } from './templateSummary.js'
import { taskToValues, toTaskInput } from './taskForm.js'
import { formatDay, formatMinutes, weekdaysSummary } from './weekFormat.js'

const STATUS = {
  active: { label: 'Active', color: 'success' },
  upcoming: { label: 'Not started yet', color: 'info' },
  ended: { label: 'Ended', color: 'default' },
}

const scheduleText = (t) => (t.recurrence === 'weekly' ? weekdaysSummary(t.weekdays ?? []) : 'Every day')

function dateText(t, status) {
  if (status === 'upcoming') return `Starts ${formatDay(t.startsOn)}`
  if (status === 'ended') return `Ended ${formatDay(t.endsOn ?? t.startsOn)}`
  return t.endsOn ? `Since ${formatDay(t.startsOn)}, until ${formatDay(t.endsOn)}` : `Since ${formatDay(t.startsOn)}`
}

// One repeating task: what it is, whether it is running, and (for running or not-yet-started ones)
// edit and end/delete. Ended tasks are read-only: their history stays in the days they appeared on.
export default function TemplateCard({ template, status, busy, onSave, onEnd, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState(null)
  const [repeat, setRepeat] = useState(template.recurrence)
  const [weekdays, setWeekdays] = useState(template.weekdays ?? [])
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [confirming, setConfirming] = useState(false)
  const chip = STATUS[status]
  const meta = [scheduleText(template), template.plannedStart, template.estimatedMinutes ? formatMinutes(template.estimatedMinutes) : null].filter(Boolean).join(' · ')

  const startEdit = () => {
    setValues(taskToValues(template))
    setRepeat(template.recurrence)
    setWeekdays(template.weekdays ?? [])
    setErrors({})
    setMessage('')
    setNotice('')
    setEditing(true)
  }

  async function save(e) {
    e.preventDefault()
    setErrors({})
    setMessage('')
    const input = toTaskInput(values)
    // An end time only makes sense with a start time, so clearing the start clears the end too.
    const changes = { ...input, plannedEnd: input.plannedStart ? template.plannedEnd : null, recurrence: repeat, weekdays: repeat === 'weekly' ? weekdays : null }
    const { ok, result, error } = await onSave(template, changes)
    if (ok) {
      setEditing(false)
      setNotice(editSummary(result))
    } else if (error?.details?.fields) setErrors(error.details.fields)
    else setMessage(error?.message ?? 'That didn’t save. Please try again.')
  }

  async function confirm() {
    setConfirming(false)
    const { ok, error } = await (status === 'upcoming' ? onDelete(template) : onEnd(template))
    if (!ok) setMessage(error?.message ?? 'That didn’t work. Please try again.')
  }

  return (
    <Box component="li" sx={{ p: 2.5, borderRadius: `${radii.md}px`, border: `1px solid ${editing ? colors.blue600 : colors.border}`, bgcolor: colors.surface, display: 'grid', gap: 1.5 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography component="h3" variant="h4" sx={{ overflowWrap: 'anywhere' }}>
          {template.title}
          {template.isPriority ? ' (priority)' : ''}
        </Typography>
        <Chip size="small" label={chip.label} color={chip.color} variant={status === 'ended' ? 'outlined' : 'filled'} />
      </Box>
      <Typography variant="body2" color="text.secondary">{meta}</Typography>
      <Typography variant="body2" color="text.secondary">{dateText(template, status)}</Typography>

      {editing ? (
        <Box component="form" onSubmit={save} noValidate aria-label={`Edit ${template.title}`} sx={{ display: 'grid', gap: 2 }}>
          <TaskFields idPrefix={`tpl-${template.id}`} values={values} errors={errors} onChange={setValues} />
          <RepeatFields repeat={repeat} weekdays={weekdays} onRepeat={setRepeat} onWeekdays={setWeekdays} errors={errors} />
          {errors.plannedEnd && <Typography variant="body2" color="error">{errors.plannedEnd}</Typography>}
          <Typography variant="body2" color="text.secondary">
            Saved changes apply to today and the days ahead that you haven’t touched. Past days, and days with progress or your own edits, stay as they were.
          </Typography>
          {message && <Typography role="alert" color="error">{message}</Typography>}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button type="submit" variant="contained" size="small" disabled={busy}>Save changes</Button>
            <Button size="small" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button>
          </Box>
        </Box>
      ) : (
        <>
          {notice && <Typography role="status" variant="body2">{notice}</Typography>}
          {message && <Typography role="alert" color="error" variant="body2">{message}</Typography>}
          {status !== 'ended' && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              <Button size="small" variant="outlined" disabled={busy} onClick={startEdit} aria-label={`Edit ${template.title}`}>Edit</Button>
              <Button size="small" color="error" disabled={busy} onClick={() => setConfirming(true)} aria-label={`${status === 'upcoming' ? 'Delete' : 'End'} ${template.title}`}>
                {status === 'upcoming' ? 'Delete' : 'End'}
              </Button>
            </Box>
          )}
        </>
      )}

      <Dialog open={confirming} onClose={() => setConfirming(false)} aria-labelledby={`end-${template.id}`}>
        <DialogTitle id={`end-${template.id}`}>{status === 'upcoming' ? `Delete “${template.title}”?` : `End “${template.title}”?`}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {status === 'upcoming'
              ? 'It hasn’t started, so there is no history to keep. It will be removed along with any days already planned for it that you haven’t touched.'
              : 'It stops being added to new days after today. Everything you’ve already done or recorded stays in your history. Days you’ve already opened keep their copy; you can remove those one by one.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)}>Keep it</Button>
          <Button color="error" variant="contained" onClick={confirm}>{status === 'upcoming' ? 'Delete' : 'End this task'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
