import { useEffect, useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { Pause, Play, Square, Timer } from 'lucide-react'
import GrowingTree from './GrowingTree.jsx'
import { PRESET_MINUTES, elapsedMs, formatClock, isFinished, progressFraction, remainingMs, wholeMinutes } from '../../utils/focus/focusSession.js'
import { focusTotals } from '../../hooks/useFocusSession.js'
import { colors, radii } from '../../theme/tokens.js'

const minutesText = (n) => (n === 1 ? '1 minute' : `${n} minutes`)
const focusedText = (ms) => (ms < 30000 ? 'less than a minute' : minutesText(Math.max(1, wholeMinutes(ms))))
const panelSx = { p: 3, borderRadius: `${radii.lg}px`, bgcolor: colors.bgAlt, border: `1px solid ${colors.border}`, display: 'grid', gap: 2 }

// The focus timer on My Day. A task's Focus button chooses it here; the person picks 15, 25, 45 or 60 minutes and starts. While a
// session runs it shows the time left and a tree growing; paused time is not counted; ending early keeps what was focused. The timer
// never marks a task done: that stays the person's choice (the summary offers it).
//   focus: the useFocusSession() value    target: the task chosen to focus on (or null)    viewDate: the day on screen
//   canMarkDone(taskId) / onMarkDone(taskId): the summary's optional "Mark it done"    onClearTarget(): drop the chosen task
export default function FocusTimer({ focus, target, viewDate, onClearTarget, canMarkDone, onMarkDone }) {
  const [minutes, setMinutes] = useState(25)
  const [problem, setProblem] = useState('')
  const [confirmingEnd, setConfirmingEnd] = useState(false)
  const { session, result, log, refresh } = focus
  // The second-by-second redraw lives here, so only this panel redraws each second. When the time is up the panel asks for a refresh,
  // which closes the session into the log and shows the summary.
  const [tick, setTick] = useState(() => Date.now())
  const running = session?.status === 'running'
  useEffect(() => {
    if (!running) return undefined
    const id = setInterval(() => {
      const t = Date.now()
      setTick(t)
      if (isFinished(session, t)) refresh()
    }, 1000)
    return () => clearInterval(id)
  }, [running, session, refresh])
  const now = Math.max(focus.now, tick)

  if (!focus.ready) return null

  if (result) {
    const completed = result.outcome === 'completed'
    return (
      <Box component="section" aria-label="Focus session summary" sx={panelSx}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <GrowingTree fraction={completed ? 1 : result.focusedMs / result.plannedMs} size={96} />
          <Box role="status" sx={{ display: 'grid', gap: 0.5 }}>
            <Typography variant="h3" component="h2">{completed ? 'Session complete' : 'Session ended early'}</Typography>
            <Typography>
              {completed
                ? `You focused for ${focusedText(result.focusedMs)} on “${result.title}”.`
                : `You focused for ${focusedText(result.focusedMs)} on “${result.title}”. That still counts.`}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {canMarkDone(result.taskId) && (
            <Button variant="contained" size="small" onClick={() => { onMarkDone(result.taskId); focus.dismissResult() }}>Mark it done</Button>
          )}
          <Button size="small" onClick={focus.dismissResult}>Close</Button>
        </Box>
      </Box>
    )
  }

  if (session) {
    const paused = session.status === 'paused'
    return (
      <Box component="section" aria-label="Focus timer" sx={panelSx}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
          <GrowingTree fraction={progressFraction(session, now)} />
          <Box sx={{ display: 'grid', gap: 0.5, minWidth: 0 }}>
            <Typography variant="h3" component="h2" sx={{ overflowWrap: 'anywhere' }}>Focusing on “{session.title}”</Typography>
            <Typography role="timer" aria-label="Time left" sx={{ fontSize: '2.5rem', fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
              {formatClock(remainingMs(session, now))}
            </Typography>
            <Typography role="status" variant="body2" color="text.secondary">
              {paused ? 'Paused. This time is not counted.' : `Running. ${minutesText(session.plannedMs / 60000)} session.`}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {paused ? (
            <Button variant="contained" size="small" startIcon={<Play size={16} aria-hidden="true" />} onClick={focus.resume}>Resume</Button>
          ) : (
            <Button variant="contained" size="small" startIcon={<Pause size={16} aria-hidden="true" />} onClick={focus.pause}>Pause</Button>
          )}
          <Button size="small" color="inherit" startIcon={<Square size={16} aria-hidden="true" />} onClick={() => setConfirmingEnd(true)}>End session</Button>
        </Box>
        <Dialog open={confirmingEnd} onClose={() => setConfirmingEnd(false)} aria-labelledby="end-focus-title">
          <DialogTitle id="end-focus-title">End this focus session?</DialogTitle>
          <DialogContent>
            <DialogContentText>You have focused for {focusedText(elapsedMs(session, now))} so far. That time is kept, and the task is not changed.</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmingEnd(false)}>Keep going</Button>
            <Button variant="contained" onClick={() => { setConfirmingEnd(false); focus.end() }}>End session</Button>
          </DialogActions>
        </Dialog>
      </Box>
    )
  }

  if (target) {
    const begin = () => {
      const outcome = focus.start(target, minutes)
      if (outcome.ok) {
        setProblem('')
        onClearTarget()
      } else {
        setProblem(outcome.reason === 'busy' ? 'A focus session is already running, in this or another tab.' : 'This browser can’t save a focus session here, so the timer can’t start.')
      }
    }
    return (
      <Box component="section" aria-label="Start a focus session" sx={panelSx}>
        <Typography variant="h3" component="h2" sx={{ overflowWrap: 'anywhere' }}>Focus on “{target.title}”</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
          <Typography component="span" sx={{ fontWeight: 600 }}>Length</Typography>
          <ToggleButtonGroup exclusive size="small" value={minutes} aria-label="Session length" onChange={(_, value) => value !== null && setMinutes(value)}>
            {PRESET_MINUTES.map((m) => <ToggleButton key={m} value={m} aria-label={`${m} minutes`}>{m} min</ToggleButton>)}
          </ToggleButtonGroup>
        </Box>
        {problem && <Typography role="alert" color="error">{problem}</Typography>}
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="contained" size="small" startIcon={<Timer size={16} aria-hidden="true" />} onClick={begin}>Start focus</Button>
          <Button size="small" onClick={() => { setProblem(''); onClearTarget() }}>Cancel</Button>
        </Box>
      </Box>
    )
  }

  const totals = focusTotals(log, viewDate)
  if (totals.sessions === 0) return null
  return (
    <Typography color="text.secondary" aria-label="Focus time on this day">
      Focus time on this day: {focusedText(totals.focusedMs)} in {totals.sessions === 1 ? '1 session' : `${totals.sessions} sessions`}.
    </Typography>
  )
}
