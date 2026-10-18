import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material'
import FormError from '../auth/FormError.jsx'
import { useI18n } from '../../hooks/useI18n.js'
import { createCustomChallenge } from '../../services/myChallengesService.js'
import { appChallengePath } from '../../constants/navigation.js'
import { addDaysIso, todayIso } from '../../utils/appDates.js'

// "Create a custom challenge": a name, a start date and an end date. It is yours alone and starts showing on your dashboard.
export default function CreateChallengeDialog({ open, onClose }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [form, setForm] = useState(() => ({ title: '', summary: '', start: todayIso(), end: addDaysIso(todayIso(), 29) }))
  const [state, setState] = useState({ busy: false, error: null })
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const days = form.start && form.end ? Math.round((new Date(form.end) - new Date(form.start)) / 86_400_000) + 1 : 0
  const problem = !form.title.trim() ? t('Give your challenge a name.') : days < 1 ? t('The end date must be on or after the start date.') : null

  const close = () => {
    if (!state.busy) onClose()
  }
  const submit = async (e) => {
    e.preventDefault()
    if (problem) return
    setState({ busy: true, error: null })
    try {
      const created = await createCustomChallenge({ title: form.title.trim(), summary: form.summary, startDate: form.start, endDate: form.end })
      setState({ busy: false, error: null })
      onClose()
      navigate(appChallengePath(created.slug))
    } catch (error) {
      setState({ busy: false, error: error.message })
    }
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs" aria-labelledby="create-challenge-title">
      <Box component="form" noValidate onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <DialogTitle id="create-challenge-title">{t('Create your own challenge')}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
          <TextField id="challenge-name" label={t('Challenge name')} value={form.title} onChange={set('title')} autoFocus slotProps={{ htmlInput: { maxLength: 80 } }} />
          <TextField id="challenge-summary" label={t('What is it about? (optional)')} value={form.summary} onChange={set('summary')} multiline minRows={2} slotProps={{ htmlInput: { maxLength: 300 } }} />
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            <TextField id="challenge-start" label={t('Start date')} type="date" value={form.start} onChange={set('start')} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField id="challenge-end" label={t('End date')} type="date" value={form.end} onChange={set('end')} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: form.start } }} />
          </Box>
          <Typography variant="body2" color="text.secondary">{days > 0 ? t('{count} days in total.', { count: days }) : problem}</Typography>
          <FormError message={state.error} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={close} disabled={state.busy}>{t('Cancel')}</Button>
          <Button type="submit" variant="contained" disabled={state.busy || Boolean(problem)}>{state.busy ? t('Creating…') : t('Create challenge')}</Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}
