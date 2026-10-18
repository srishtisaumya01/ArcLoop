import { useState } from 'react'
import { Box, Button, Checkbox, FormControlLabel, FormGroup, FormLabel, Typography } from '@mui/material'
import { colors, radii } from '../../theme/tokens.js'
import { MINIMUM_DAY_COPY as COPY } from '../../constants/minimumDayCopy.js'
import { PLANNER_CONFIG } from '../../utils/planner/index.js'

const STATE_LABEL = { 0: 'Not done', 0.5: 'Partly done', 1: 'Done' }

// Minimum Day: an optional, separate setting that works alongside Normal, Busy and Rest. The person picks up to
// `limit` of the day's planned tasks as the few that keep the day moving. It is only a label: choosing, changing or
// finishing the minimum never completes, sets aside or moves any task, and the day's percentage is reported elsewhere.
//   minimum: summarizeMinimum(...) of the day's tasks;  onSave(ids) -> Promise<{ ok, error }>
export default function MinimumDayPanel({ occurrences, minimum, canEdit, isToday, busy, onSave, limit = PLANNER_CONFIG.limits.minimumTasks }) {
  const planned = occurrences.filter((o) => o.planState === 'active')
  const [choosing, setChoosing] = useState(false)
  const [selected, setSelected] = useState([])
  const [message, setMessage] = useState('')
  if (!canEdit && minimum.count === 0) return null // read-only history with no minimum has nothing to show

  const chosen = planned.filter((o) => minimum.ids.includes(o.id))
  const start = () => {
    setSelected(minimum.ids)
    setMessage('')
    setChoosing(true)
  }
  const toggle = (id) => setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))
  async function save(ids) {
    setMessage('')
    const { ok, error } = await onSave(ids)
    if (ok) setChoosing(false)
    else setMessage(error?.message ?? COPY.saveFailed)
  }

  return (
    <Box component="section" role="region" aria-label={COPY.name} sx={{ p: 3, borderRadius: `${radii.lg}px`, bgcolor: colors.bgAlt, border: `1px solid ${colors.border}`, display: 'grid', gap: 1.5 }}>
      <Typography variant="h3" component="h2">{COPY.name}</Typography>
      <Typography color="text.secondary">{COPY.description}</Typography>

      {choosing ? (
        <Box
          component="form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            save(selected)
          }}
          sx={{ display: 'grid', gap: 1 }}
        >
          <FormLabel component="legend" sx={{ color: 'text.primary', fontWeight: 600 }}>{COPY.legend(limit)}</FormLabel>
          <FormGroup>
            {planned.map((task) => {
              const checked = selected.includes(task.id)
              return (
                <FormControlLabel
                  key={task.id}
                  control={<Checkbox checked={checked} onChange={() => toggle(task.id)} disabled={busy || (!checked && selected.length >= limit)} />}
                  label={task.title}
                  sx={{ overflowWrap: 'anywhere', mr: 0 }}
                />
              )
            })}
          </FormGroup>
          <Typography variant="body2" color="text.secondary" aria-live="polite">{COPY.chosen(selected.length, limit)}</Typography>
          {message && <Typography role="alert" color="error">{message}</Typography>}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, ml: -1 }}>
            <Button type="submit" size="small" variant="contained" disabled={busy || selected.length === 0}>{COPY.save}</Button>
            <Button size="small" disabled={busy} onClick={() => setChoosing(false)}>{COPY.cancel}</Button>
          </Box>
        </Box>
      ) : (
        <>
          {minimum.count > 0 ? (
            <>
              <Box component="ul" aria-label="Your minimum tasks" sx={{ m: 0, pl: 3, color: colors.textSecondary }}>
                {chosen.map((task) => (
                  <li key={task.id}>{task.title} · {STATE_LABEL[task.completion]}</li>
                ))}
              </Box>
              <Typography variant="body2" color="text.secondary">{COPY.progress(minimum.done, minimum.count)}</Typography>
              {isToday && <Typography role="status">{minimum.status === 'complete' ? COPY.complete : COPY.incomplete}</Typography>}
            </>
          ) : (
            <Typography color="text.secondary">{planned.length === 0 ? COPY.noTasks : COPY.noneChosen}</Typography>
          )}
          {message && <Typography role="alert" color="error">{message}</Typography>}
          {canEdit && (planned.length > 0 || minimum.count > 0) && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, ml: -1 }}>
              <Button size="small" variant={minimum.count > 0 ? 'outlined' : 'contained'} disabled={busy || planned.length === 0} onClick={start}>
                {minimum.count > 0 ? COPY.change : COPY.choose}
              </Button>
              {minimum.count > 0 && <Button size="small" disabled={busy} onClick={() => save([])}>{COPY.clear}</Button>}
            </Box>
          )}
        </>
      )}
    </Box>
  )
}
