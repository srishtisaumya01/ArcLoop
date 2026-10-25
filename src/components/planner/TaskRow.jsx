import { useState } from 'react'
import { CalendarDays, Check, Clock, Pencil, Repeat, Timer, Trash2, Undo2 } from 'lucide-react'
import { Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { colors, radii } from '../../theme/tokens.js'
import TaskReminderControl from '../reminders/TaskReminderControl.jsx'
import MoveTaskForm from './MoveTaskForm.jsx'
import TaskFields from './TaskFields.jsx'
import TaskTimeControl from './TaskTimeControl.jsx'
import { levelOf } from '../../utils/planner/priority.js'
import { taskToValues, toTaskInput } from './taskForm.js'
import { EXCLUDED_LABEL, formatDay, formatMinutes, timeRange, weekdayName } from './weekFormat.js'

const STATES = [
  { value: 0, label: 'Not done' },
  { value: 0.5, label: 'Partly' },
  { value: 1, label: 'Done' },
]

// One task in the day's checklist. Completion is 0 / half / done; set-aside tasks can be put back.
// Editing changes this day's task only; removing follows the planner's removal rules.
export default function TaskRow({ task, canRecord, canEdit, busy, moveRange, marker, onFocus, focusing, focusLocked, focusedMs, onSetTime, onCompletion, onRestore, onEdit, onRemove, onStopRepeating, canRemind, reminder, remindersOn, onSetReminder, onRemoveReminder, move, onMove, onUndoMove }) {
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState(null)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [moving, setMoving] = useState(false)
  const [timing, setTiming] = useState(false)
  const [progress, setProgress] = useState(0) // the progress chosen in the edit form
  const [ticked, setTicked] = useState(task.completion >= 1) // the box is only a tick: the Done button is what records it
  const excluded = task.planState === 'excluded'
  const repeats = Boolean(task.templateId) && !excluded

  const startEdit = () => {
    setValues(taskToValues(task))
    setProgress(task.completion)
    setErrors({})
    setMessage('')
    setEditing(true)
  }
  async function save(e) {
    e.preventDefault()
    setErrors({})
    setMessage('')
    // Only what changed is saved: an unchanged detail form must not mark the task as customised, and progress goes through
    // the same completion path as the checkbox.
    const input = toTaskInput(values)
    if (JSON.stringify(input) !== JSON.stringify(toTaskInput(taskToValues(task)))) {
      const { ok, error } = await onEdit(task, input)
      if (!ok) {
        if (error?.details?.fields) setErrors(error.details.fields)
        else setMessage(error?.message ?? 'That didn’t save. Please try again.')
        return
      }
    }
    if (canRecord && progress !== task.completion) {
      const { ok, error } = await onCompletion(task, progress)
      if (!ok) {
        setMessage(error?.message ?? 'That didn’t save. Please try again.')
        return
      }
    }
    setEditing(false)
  }

  if (editing) {
    return (
      <Box component="li" sx={{ p: 2, borderRadius: `${radii.md}px`, border: `2px solid ${colors.blue600}`, bgcolor: colors.surface }}>
        <Box component="form" onSubmit={save} noValidate aria-label={`Edit ${task.title}`} sx={{ display: 'grid', gap: 2 }}>
          <TaskFields idPrefix={`edit-${task.id}`} values={values} errors={errors} onChange={setValues} />
          {canRecord && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
              <Typography component="span" sx={{ fontWeight: 600 }}>Progress</Typography>
              <ToggleButtonGroup exclusive size="small" value={progress} aria-label="Progress" onChange={(_, value) => value !== null && setProgress(value)}>
                {STATES.map((s) => (
                  <ToggleButton key={s.value} value={s.value}>{s.label}</ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
          )}
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

  const done = task.completion >= 1
  const chips = [
    timeRange(task) ? { icon: Clock, label: timeRange(task) } : null,
    task.estimatedMinutes ? { icon: Timer, label: formatMinutes(task.estimatedMinutes) } : null,
    task.category ? { label: task.category } : null,
    focusedMs >= 30000 ? { label: `${formatMinutes(Math.max(1, Math.round(focusedMs / 60000)))} focused` } : null,
    repeats ? { icon: Repeat, label: 'Repeats' } : null,
  ].filter(Boolean)
  const toolBtn = { textTransform: 'none', fontWeight: 600, fontSize: '0.8125rem', borderRadius: '999px', px: 1.5, color: colors.textSecondary, '&:hover': { bgcolor: colors.bgAlt, color: colors.textPrimary } }

  return (
    <Box component="li" sx={{ p: { xs: 1.75, sm: 2.25 }, borderRadius: `${radii.md}px`, border: `1px solid ${done && !excluded ? colors.success : colors.border}`, bgcolor: colors.surface, display: 'grid', gap: 1.25, boxShadow: '0 1px 2px rgba(11, 27, 58, 0.04)' }}>
      <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
        {!excluded && (
          <Checkbox
            checked={ticked}
            disabled={!canRecord || busy || done}
            onChange={(e) => setTicked(e.target.checked)}
            slotProps={{ input: { 'aria-label': `Tick: ${task.title}` } }}
            sx={{ ml: -1, mt: -0.5, p: 1.25 }} // 44 px square: a comfortable tap target (spec DP-06)
          />
        )}
        <Box sx={{ flex: 1, minWidth: 0, display: 'grid', gap: 0.75 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '1.0625rem', lineHeight: 1.35, overflowWrap: 'anywhere', ...(done && !excluded ? { textDecoration: 'line-through', color: 'text.secondary' } : {}) }}>
            {task.title}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
            {task.isPriority && <Chip size="small" label="Priority" color="warning" variant="outlined" />}
            {levelOf(task) === 'low' && !excluded && <Chip label="Low priority" size="small" variant="outlined" />}
            {task.isMinimum && !excluded && <Chip label="Minimum" size="small" variant="outlined" color="primary" />}
            {marker && !excluded && <Chip label={marker === 'now' ? 'Now' : 'Next up'} size="small" color={marker === 'now' ? 'primary' : 'default'} />}
            {focusing && !excluded && <Chip label="Focusing" size="small" color="success" variant="outlined" />}
            {chips.map(({ icon: Icon, label }) => (
              <Chip key={label} size="small" variant="outlined" label={label} icon={Icon ? <Icon size={13} aria-hidden="true" /> : undefined} sx={{ color: colors.textSecondary, borderColor: colors.border, '& .MuiChip-icon': { color: 'inherit' } }} />
            ))}
          </Box>
        </Box>
        {!excluded && canRecord && (
          done ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
              <Chip icon={<Check size={14} aria-hidden="true" />} label="Done" color="success" size="small" />
              <Button size="small" sx={toolBtn} disabled={busy} onClick={() => { setTicked(false); onCompletion(task, 0) }} aria-label={`Undo done: ${task.title}`} startIcon={<Undo2 size={14} aria-hidden="true" />}>Undo</Button>
            </Box>
          ) : (
            <Button variant="contained" size="small" disabled={!ticked || busy} onClick={() => onCompletion(task, 1)} aria-label={`Mark done: ${task.title}`} startIcon={<Check size={16} aria-hidden="true" />} sx={{ flexShrink: 0, borderRadius: '999px', px: 2, fontWeight: 700 }}>
              Done
            </Button>
          )
        )}
      </Box>
      {task.description && <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: 'text.secondary' }}>{task.description}</Typography>}
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
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center', pt: 1, borderTop: `1px solid ${colors.border}`, ml: -0.5 }}>
          {onFocus && !done && (
            <Button size="small" sx={toolBtn} startIcon={<Timer size={15} aria-hidden="true" />} disabled={busy || focusing || focusLocked} onClick={() => onFocus(task)} aria-label={`Focus on ${task.title}`}
              title={focusLocked && !focusing ? 'A focus session is already running. End it to focus on something else.' : undefined}>Focus</Button>
          )}
          {canEdit && (
            <Button size="small" sx={toolBtn} startIcon={<Pencil size={15} aria-hidden="true" />} disabled={busy} onClick={startEdit} aria-label={`Edit ${task.title}`}>Edit</Button>
          )}
          {canEdit && onSetTime && !done && (
            <Button size="small" sx={toolBtn} startIcon={<Clock size={15} aria-hidden="true" />} disabled={busy} aria-expanded={timing} onClick={() => setTiming((open) => !open)}
              aria-label={task.plannedStart ? `Change the time of ${task.title}` : `Set a time for ${task.title}`}>{task.plannedStart ? 'Change time' : 'Set time'}</Button>
          )}
          {canEdit && !done && (
            <>
              {onMove && <Button size="small" sx={toolBtn} startIcon={<CalendarDays size={15} aria-hidden="true" />} disabled={busy} onClick={() => setMoving(true)} aria-label={`Move ${task.title}`}>Move</Button>}
              <Button size="small" sx={{ ...toolBtn, '&:hover': { bgcolor: colors.errorBg, color: colors.error } }} startIcon={<Trash2 size={15} aria-hidden="true" />} disabled={busy} onClick={() => setConfirming(true)} aria-label={`Remove ${task.title}`}>Remove</Button>
            </>
          )}
        </Box>
      )}
      {timing && !excluded && onSetTime && <TaskTimeControl task={task} busy={busy} onSave={(times) => onSetTime(task, times)} onClose={() => setTiming(false)} />}
      {moving && !excluded && <MoveTaskForm task={task} busy={busy} onMove={onMove} range={moveRange} onCancel={() => setMoving(false)} />}
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
