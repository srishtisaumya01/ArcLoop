import { useEffect, useRef, useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { Pause, Play, Square, Timer } from 'lucide-react'
import GrowingTree from './GrowingTree.jsx'
import { PRESET_MINUTES, elapsedMs, formatClock, gapMs, hasGap, isFinished, progressFraction, remainingMs, wholeMinutes } from '../../utils/focus/focusSession.js'
import { focusTotals } from '../../hooks/useFocusSession.js'
import { breakSuggestion } from '../../utils/focus/focusBreak.js'
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
  // When the person's own action replaces what was focused (Focus on a task, Start, End), the button they used disappears. Focus moves to the
  // panel's heading, so a keyboard or screen-reader user is not dropped at the top of the page and, on a phone, the panel is brought into view.
  // It is never moved by anything the person did not do (the page opening, a session finishing on its own).
  const headingRef = useRef(null)
  const wantsFocus = useRef(false)
  const targetId = target?.id
  useEffect(() => {
    if (targetId) wantsFocus.current = true
  }, [targetId])
  useEffect(() => {
    if (wantsFocus.current && headingRef.current) {
      wantsFocus.current = false
      headingRef.current.focus()
    }
  })
  // The second-by-second redraw lives here, so only this panel redraws each second. When the time is up the panel asks for a refresh,
  // which closes the session into the log and shows the summary.
  const [tick, setTick] = useState(() => Date.now())
  const running = session?.status === 'running'
  const { look } = focus
  useEffect(() => {
    if (!running) return undefined
    const id = setInterval(() => {
      const t = Date.now()
      look() // notes this look; if the last one was far too long ago (asleep, frozen) the time in between is marked as not counted
      setTick(t)
      if (isFinished(session, t)) refresh()
    }, 1000)
    return () => clearInterval(id)
  }, [running, session, refresh, look])
  const now = Math.max(focus.now, tick)

  if (!focus.ready) return null

  if (result) {
    const completed = result.outcome === 'completed'
    return (
      <Box component="section" aria-label="Focus session summary" sx={panelSx}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <GrowingTree fraction={completed ? 1 : result.focusedMs / result.plannedMs} size={96} />
          <Box role="status" sx={{ display: 'grid', gap: 0.5 }}>
            <Typography ref={headingRef} tabIndex={-1} variant="h3" component="h2">{completed ? 'Session complete' : 'Session ended early'}</Typography>
            <Typography>
              {completed
                ? `You focused for ${focusedText(result.focusedMs)} on “${result.title}”.`
                : `You focused for ${focusedText(result.focusedMs)} on “${result.title}”. That still counts.`}
            </Typography>
            {breakSuggestion(result.focusedMs) && <Typography variant="body2" color="text.secondary">{breakSuggestion(result.focusedMs).text}</Typography>}
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
    const gap = hasGap(session)
    return (
      <Box component="section" aria-label="Focus timer" sx={panelSx}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
          <GrowingTree fraction={progressFraction(session, now)} />
          <Box sx={{ display: 'grid', gap: 0.5, minWidth: 0 }}>
            <Typography ref={headingRef} tabIndex={-1} variant="h3" component="h2" sx={{ overflowWrap: 'anywhere' }}>Focusing on “{session.title}”</Typography>
            <Typography role="timer" aria-label="Time left" sx={{ fontSize: '2.5rem', fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
              {formatClock(remainingMs(session, now))}
            </Typography>
            <Typography role="status" variant="body2" color="text.secondary">
              {paused ? 'Paused. This time is not counted.' : gap ? 'Waiting for your answer. The time below is what was seen.' : `Running. ${minutesText(session.plannedMs / 60000)} session.`}
            </Typography>
          </Box>
        </Box>
        {gap && (
          <Box role="alert" sx={{ display: 'grid', gap: 1, p: 2, borderRadius: `${radii.md}px`, border: `1px solid ${colors.border}`, bgcolor: colors.surface }}>
            <Typography sx={{ fontWeight: 600 }}>The timer wasn’t running for about {minutesText(Math.max(1, wholeMinutes(gapMs(session, now))))}.</Typography>
            <Typography variant="body2" color="text.secondary">The computer may have slept, or this page was inactive. Were you focusing the whole time?</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              <Button variant="contained" size="small" onClick={focus.keepGap}>Yes, count that time</Button>
              <Button variant="outlined" size="small" onClick={focus.dropGap}>No, don’t count it</Button>
            </Box>
          </Box>
        )}
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
            <Button variant="contained" onClick={() => { setConfirmingEnd(false); wantsFocus.current = true; focus.end() }}>End session</Button>
          </DialogActions>
        </Dialog>
      </Box>
    )
  }

  if (target) {
    const begin = () => {
      const outcome = focus.start(target, minutes)
      if (outcome.ok) {
        wantsFocus.current = true // the running timer takes the place of this panel
        setProblem('')
        onClearTarget()
      } else {
        setProblem(outcome.reason === 'busy' ? 'A focus session is already running, in this or another tab.' : 'This browser can’t save a focus session here, so the timer can’t start.')
      }
    }
    return (
      <Box component="section" aria-label="Start a focus session" sx={panelSx}>
        <Typography ref={headingRef} tabIndex={-1} variant="h3" component="h2" sx={{ overflowWrap: 'anywhere' }}>Focus on “{target.title}”</Typography>
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
