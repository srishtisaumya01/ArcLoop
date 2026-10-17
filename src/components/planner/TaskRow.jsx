import { useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { colors, radii } from '../../theme/tokens.js'
import TaskReminderControl from '../reminders/TaskReminderControl.jsx'
import MoveTaskForm from './MoveTaskForm.jsx'
import TaskFields from './TaskFields.jsx'
import { taskToValues, toTaskInput } from './taskForm.js'
import { EXCLUDED_LABEL, formatDay, formatMinutes, weekdayName } from './weekFormat.js'

const STATES = [
  { value: 0, label: 'Not done' },
  { value: 0.5, label: 'Partly' },
  { value: 1, label: 'Done' },
]

// One task in the day's checklist. Completion is 0 / half / done; set-aside tasks can be put back.
// Editing changes this day's task only; removing follows the planner's removal rules.
export default function TaskRow({ task, canRecord, canEdit, busy, onCompletion, onSetAside, onRestore, onEdit, onRemove, onStopRepeating, canRemind, reminder, remindersOn, onSetReminder, onRemoveReminder, move, onMove, onUndoMove }) {
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState(null)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [moving, setMoving] = useState(false)
  const excluded = task.planState === 'excluded'
  const meta = [task.plannedStart, task.estimatedMinutes ? formatMinutes(task.estimatedMinutes) : null, task.category].filter(Boolean).join(' · ')
  const repeats = Boolean(task.templateId) && !excluded

  const startEdit = () => {
    setValues(taskToValues(task))
    setErrors({})
    setMessage('')
    setEditing(true)
  }
  async function save(e) {
    e.preventDefault()
    setErrors({})
    setMessage('')
    const { ok, error } = await onEdit(task, toTaskInput(values))
    if (ok) setEditing(false)
    else if (error?.details?.fields) setErrors(error.details.fields)
    else setMessage(error?.message ?? 'That didn’t save. Please try again.')
  }

  if (editing) {
    return (
      <Box component="li" sx={{ p: 2, borderRadius: `${radii.md}px`, border: `2px solid ${colors.blue600}`, bgcolor: colors.surface }}>
        <Box component="form" onSubmit={save} noValidate aria-label={`Edit ${task.title}`} sx={{ display: 'grid', gap: 2 }}>
          <TaskFields idPrefix={`edit-${task.id}`} values={values} errors={errors} onChange={setValues} />
          <Typography variant="body2" color="text.secondary">Changes apply to this day only.</Typography>
          {message && <Typography role="alert" color="error">{message}</Typography>}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button type="submit" variant="contained" size="small" disabled={busy}>Save changes</Button>
            <Button size="small" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
          </Box>
        </Box>
      </Box>
    )
  }

  return (
    <Box component="li" sx={{ p: 2, borderRadius: `${radii.md}px`, border: `1px solid ${colors.border}`, bgcolor: colors.surface, display: 'grid', gap: 1 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
          {task.title}
          {task.isPriority ? ' (priority)' : ''}
        </Typography>
        {(meta || repeats) && <Typography variant="body2" color="text.secondary">{[meta, repeats ? 'repeats' : null].filter(Boolean).join(' · ')}</Typography>}
      </Box>
      {!excluded && move?.movedFrom && (
        <Typography variant="body2" color="text.secondary">Moved from {weekdayName(move.movedFrom)} {formatDay(move.movedFrom)}</Typography>
      )}
      {excluded ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            {task.excludedReason === 'rescheduled' && move?.movedTo ? `Moved to ${weekdayName(move.movedTo)} ${formatDay(move.movedTo)}` : EXCLUDED_LABEL[task.excludedReason] ?? 'Set aside'}
          </Typography>
          {canEdit && task.excludedReason === 'rescheduled' && onUndoMove && (
            <Button size="small" variant="outlined" disabled={busy} onClick={() => onUndoMove(task)} aria-label={`Undo move of ${task.title}`}>
              Undo move
            </Button>
          )}
          {canEdit && task.excludedReason !== 'rescheduled' && task.excludedReason !== 'removed' && (
            <Button size="small" variant="outlined" disabled={busy} onClick={() => onRestore(task)} aria-label={`Put back ${task.title}`}>
              Put back
            </Button>
          )}
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={task.completion}
            disabled={!canRecord || busy}
            aria-label={`Progress for ${task.title}`}
            onChange={(_, value) => value !== null && onCompletion(task, value)}
          >
            {STATES.map((s) => (
              <ToggleButton key={s.value} value={s.value} aria-label={`${s.label}: ${task.title}`}>
                {s.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          {canEdit && (
            <Button size="small" disabled={busy} onClick={startEdit} aria-label={`Edit ${task.title}`}>Edit</Button>
          )}
          {canEdit && task.completion < 1 && (
            <>
              {onMove && <Button size="small" disabled={busy} onClick={() => setMoving(true)} aria-label={`Move ${task.title}`}>Move</Button>}
              <Button size="small" disabled={busy} onClick={() => onSetAside(task)} aria-label={`Set aside ${task.title}`}>Set aside</Button>
              <Button size="small" color="error" disabled={busy} onClick={() => setConfirming(true)} aria-label={`Remove ${task.title}`}>Remove</Button>
            </>
          )}
        </Box>
      )}
      {moving && !excluded && <MoveTaskForm task={task} busy={busy} onMove={onMove} onCancel={() => setMoving(false)} />}
      {canRemind && !excluded && task.completion < 1 && (
        <TaskReminderControl task={task} reminder={reminder} remindersOn={remindersOn} busy={busy} onSet={onSetReminder} onRemove={onRemoveReminder} />
      )}
      <Dialog open={confirming} onClose={() => setConfirming(false)} aria-labelledby={`remove-${task.id}`}>
        <DialogTitle id={`remove-${task.id}`}>Remove “{task.title}” from this day?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {repeats
              ? 'This only affects this day. The task keeps repeating on other days unless you stop it repeating.'
              : 'This only affects this day.'}
            {' '}If the day’s plan was already started, it stays in the record as removed.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)}>Keep it</Button>
          {repeats && onStopRepeating && (
            <Button onClick={() => { setConfirming(false); onStopRepeating(task) }}>Stop repeating after today</Button>
          )}
          <Button color="error" variant="contained" onClick={() => { setConfirming(false); onRemove(task) }}>Remove from this day</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
