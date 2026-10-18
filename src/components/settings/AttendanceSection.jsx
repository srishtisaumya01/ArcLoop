import { useState } from 'react'
import { Box, Button, Skeleton, TextField, Typography } from '@mui/material'
import FormError from '../auth/FormError.jsx'
import SettingsSection from './SettingsSection.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useI18n } from '../../hooks/useI18n.js'
import { getCheckin, saveShift } from '../../services/checkinService.js'

// The working hours that attendance follows: check-in opens at the start time; the end time is when you plan to check out.
function ShiftForm({ initial }) {
  const { t } = useI18n()
  const [start, setStart] = useState(initial.shift_start)
  const [end, setEnd] = useState(initial.shift_end)
  const [state, setState] = useState({ busy: false, error: null, done: false })
  const dirty = start !== initial.shift_start || end !== initial.shift_end

  const submit = async (e) => {
    e.preventDefault()
    if (!start || !end) return
    setState({ busy: true, error: null, done: false })
    try {
      await saveShift({ start, end })
      setState({ busy: false, error: null, done: true })
    } catch (error) {
      setState({ busy: false, error: error.message, done: false })
    }
  }
  const edit = (setter) => (e) => {
    setter(e.target.value)
    setState((s) => ({ ...s, done: false }))
  }

  return (
    <Box component="form" noValidate onSubmit={submit} sx={{ display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        <TextField id="field-shift-start" label={t('Check-in time')} type="time" value={start} onChange={edit(setStart)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField id="field-shift-end" label={t('Check-out time')} type="time" value={end} onChange={edit(setEnd)} slotProps={{ inputLabel: { shrink: true } }} />
      </Box>
      <Typography variant="body2" color="text.secondary">{t('Check-in opens at your check-in time. Checking out is only allowed six hours or more after you check in.')}</Typography>
      <FormError message={state.error} />
      {state.done && <Typography role="status">{t('Saved.')}</Typography>}
      <Box><Button type="submit" variant="contained" disabled={state.busy || !dirty}>{t('Save hours')}</Button></Box>
    </Box>
  )
}

export default function AttendanceSection() {
  const { t } = useI18n()
  const { status, data } = useAsync(getCheckin)
  return (
    <SettingsSection title={t('Attendance')} description={t('Your check-in and check-out times.')}>
      {status === 'loading' && <Skeleton variant="rounded" height={120} />}
      {status === 'error' && <Typography color="text.secondary">{t('We couldn’t load your attendance')}</Typography>}
      {data && <ShiftForm initial={data} />}
    </SettingsSection>
  )
}
