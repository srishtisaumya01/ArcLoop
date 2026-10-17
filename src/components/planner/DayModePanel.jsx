import { useState } from 'react'
import { Box, Button, Typography } from '@mui/material'
import { colors, radii } from '../../theme/tokens.js'
import { DAY_MODE_COPY } from '../../constants/dayModeCopy.js'
import { useDismissible } from '../../hooks/useDismissible.js'
import { proposeSetAside } from '../../utils/planner/index.js'

// Guided shortcut for a Busy or Rest day (spec DP-13, DP-15). It only PROPOSES which open tasks to set
// aside, using the planner's own rule (Busy keeps priority tasks; Rest proposes every open task; done tasks
// are never proposed). Nothing happens until the person chooses, each task is set aside explicitly and
// stays listed and reversible, and "Keep them all" hides the offer for this day and mode only.
//   onApply(ids, reason) -> Promise<{ ok, error }>
export default function DayModePanel({ planDate, mode, occurrences, busy, canEdit, onApply }) {
  const copy = DAY_MODE_COPY[mode]
  const [dismissed, dismiss] = useDismissible(`modeOffer:${planDate}:${mode}`)
  const [message, setMessage] = useState('')
  if (!copy || !canEdit) return null
  const { ids, reason } = proposeSetAside({ mode, occurrences })
  const titles = occurrences.filter((o) => ids.includes(o.id)).map((o) => o.title)

  async function apply() {
    setMessage('')
    const { ok, error } = await onApply(ids, reason)
    if (!ok) setMessage(error?.message ?? 'That didn’t save. Please try again.')
  }

  return (
    <Box component="section" role="region" aria-label={`${mode === 'busy' ? 'Busy' : 'Rest'} day`} sx={{ p: 3, borderRadius: `${radii.lg}px`, bgcolor: colors.bgAlt, border: `1px solid ${colors.border}`, display: 'grid', gap: 1 }}>
      <Typography variant="h3" component="h2">{copy.heading}</Typography>
      {ids.length === 0 && <Typography color="text.secondary">{copy.nothing}</Typography>}
      {ids.length > 0 && !dismissed && (
        <>
          <Typography>{copy.offer(ids.length)}</Typography>
          <Box component="ul" aria-label="Tasks proposed for setting aside" sx={{ m: 0, pl: 3, color: colors.textSecondary }}>
            {titles.map((title, i) => (
              <li key={`${ids[i]}`}>{title}</li>
            ))}
          </Box>
          {message && <Typography role="alert" color="error">{message}</Typography>}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, ml: -1 }}>
            <Button size="small" variant="contained" disabled={busy} onClick={apply}>{copy.apply}</Button>
            <Button size="small" disabled={busy} onClick={dismiss}>{DAY_MODE_COPY.keep}</Button>
          </Box>
        </>
      )}
    </Box>
  )
}
