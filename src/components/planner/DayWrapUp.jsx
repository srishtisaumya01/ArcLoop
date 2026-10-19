import { useEffect, useId, useState } from 'react'
import { Box, Button, Checkbox, FormControlLabel, Typography } from '@mui/material'
import { ClipboardCheck } from 'lucide-react'
import { wrapUpOf } from './dayWrapUp.js'
import { formatMinutes } from './weekFormat.js'
import { colors, radii } from '../../theme/tokens.js'

const focusText = (ms, sessions) =>
  sessions === 0 ? 'No focus sessions were recorded in this browser today.' : `${formatMinutes(Math.max(1, Math.round(ms / 60000)))} in ${sessions === 1 ? '1 session' : `${sessions} sessions`} (kept in this browser).`

// The end of the day on My Day: what got done, the focus time, what is still open, and a choice of what to carry to tomorrow. Opened by the
// person (it is a button, not a pop-up) and it only moves tasks when they press the button, one-off tasks they have ticked. A task that did not
// happen is just a task: the words say so, nothing is counted against anyone, and every move can be undone on the moved task.
//   occurrences: the day's tasks    focusMs, sessions: the day's focus time from this browser    tomorrowLabel: "Wednesday 11 Mar"
//   busy: a change is being saved    onCarry(ids) -> Promise<{ ok }>    notice: the words about the last carry, or null
//   getRepeatingIds() -> Promise<Set>: the ids of the templates that really repeat (asked once, when the panel is first opened)
export default function DayWrapUp({ occurrences, focusMs, sessions, tomorrowLabel, busy, onCarry, notice, getRepeatingIds }) {
  const [open, setOpen] = useState(false)
  const [repeatingIds, setRepeatingIds] = useState(null) // null until asked
  const [unticked, setUnticked] = useState(() => new Set()) // every open one-off task starts ticked; this holds the ones the person unticked
  const panelId = useId()
  useEffect(() => {
    if (!open || repeatingIds !== null) return undefined
    let alive = true
    // If the templates cannot be read, every open task is offered: moving a repeating one is harmless, only needless.
    Promise.resolve()
      .then(getRepeatingIds)
      .then((ids) => alive && setRepeatingIds(ids))
      .catch(() => alive && setRepeatingIds(new Set()))
    return () => {
      alive = false
    }
  }, [open, repeatingIds, getRepeatingIds])
  const ready = repeatingIds !== null
  const { done, partly, carryable, repeating, open: stillOpen } = wrapUpOf(occurrences, repeatingIds ?? new Set())
  const chosen = carryable.filter((t) => !unticked.has(t.id))
  const toggle = (id) => setUnticked((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  return (
    <Box component="section" aria-label="Wrap up the day" sx={{ display: 'grid', gap: 1.5 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
        <Typography variant="h3" component="h2">Wrap up today</Typography>
        <Button size="small" variant="outlined" startIcon={<ClipboardCheck size={16} aria-hidden="true" />} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide the wrap-up' : 'Look back on the day'}
        </Button>
      </Box>
      {notice && <Typography role="status" variant="body2" color="text.secondary">{notice}</Typography>}
      {open && (
        <Box id={panelId} sx={{ display: 'grid', gap: 2, p: 3, borderRadius: `${radii.lg}px`, bgcolor: colors.bgAlt, border: `1px solid ${colors.border}` }}>
          <Typography color="text.secondary">A quick look back, and a choice about what carries over. A task that did not happen today is just a task.</Typography>

          <Box component="section" aria-label="Done today">
            <Typography variant="h4" component="h3">Done today ({done.length})</Typography>
            {done.length === 0 ? (
              <Typography color="text.secondary">Nothing is ticked off yet. That is fine.</Typography>
            ) : (
              <Box component="ul" sx={{ m: 0, pl: 3 }}>{done.map((t) => <li key={t.id}>{t.title}</li>)}</Box>
            )}
            {partly.length > 0 && <Typography variant="body2" color="text.secondary">{partly.length === 1 ? '1 more is partly done.' : `${partly.length} more are partly done.`} Partly done counts.</Typography>}
          </Box>

          <Box component="section" aria-label="Focus time today">
            <Typography variant="h4" component="h3">Focus time</Typography>
            <Typography>{focusText(focusMs, sessions)}</Typography>
          </Box>

          <Box component="section" aria-label="Still open">
            <Typography variant="h4" component="h3">Still open ({stillOpen.length})</Typography>
            {!ready && <Typography color="text.secondary">One moment, looking at which tasks repeat…</Typography>}
            {ready && stillOpen.length === 0 && <Typography color="text.secondary">Nothing is left open.</Typography>}
            {ready && carryable.length > 0 && (
              <Box component="fieldset" sx={{ border: 0, p: 0, m: 0, display: 'grid' }}>
                <Typography component="legend" variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Carry to {tomorrowLabel}</Typography>
                {carryable.map((t) => (
                  <FormControlLabel key={t.id} control={<Checkbox checked={!unticked.has(t.id)} onChange={() => toggle(t.id)} disabled={busy} />}
                    label={`${t.title}${t.completion > 0 ? ' (partly done)' : ''}`} />
                ))}
              </Box>
            )}
            {ready && repeating.length > 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                These repeat anyway, so they will be on their own days: {repeating.map((t) => t.title).join(', ')}.
              </Typography>
            )}
          </Box>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {ready && carryable.length > 0 && (
              <Button variant="contained" size="small" disabled={busy || chosen.length === 0} onClick={() => onCarry(chosen.map((t) => t.id))}>
                {chosen.length === 0 ? 'Choose what to carry' : `Carry ${chosen.length} to ${tomorrowLabel}`}
              </Button>
            )}
            <Button size="small" onClick={() => setOpen(false)}>Close</Button>
          </Box>
        </Box>
      )}
    </Box>
  )
}
