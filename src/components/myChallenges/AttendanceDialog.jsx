import { useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'
import { Check } from 'lucide-react'
import FormError from '../auth/FormError.jsx'
import { useI18n } from '../../hooks/useI18n.js'
import { setAttendance } from '../../services/myChallengesService.js'
import { addDaysIso } from '../../utils/appDates.js'
import { colors } from '../../theme/tokens.js'

// The attendance calendar of one challenge: every day from its start to its end. Days already marked show a tick, and only
// today can be ticked (or un-ticked) and saved. Earlier and later days are shown but cannot be changed.
export default function AttendanceDialog({ item, open, onClose }) {
  const { t, lang } = useI18n()
  const { enrollment } = item
  const today = enrollment.today
  const marked = new Set(enrollment.attended)
  const [tick, setTick] = useState(marked.has(today))
  const [state, setState] = useState({ busy: false, error: null })
  const inWindow = today >= enrollment.start_date && today <= enrollment.end_date
  const changed = tick !== marked.has(today)

  const days = []
  for (let d = enrollment.start_date; d <= enrollment.end_date && days.length < 420; d = addDaysIso(d, 1)) days.push(d)
  const months = []
  for (const d of days) {
    const key = d.slice(0, 7)
    if (months.at(-1)?.key !== key) months.push({ key, days: [] })
    months.at(-1).days.push(d)
  }
  const monthName = (key) => new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-GB', { month: 'long', year: 'numeric' }).format(new Date(`${key}-01T12:00:00`))
  const weekday = (iso) => (new Date(`${iso}T12:00:00`).getDay() + 6) % 7 // Monday first

  const close = () => {
    if (!state.busy) onClose()
  }
  const save = async () => {
    setState({ busy: true, error: null })
    try {
      await setAttendance(item.slug, tick)
      setState({ busy: false, error: null })
      onClose()
    } catch (error) {
      setState({ busy: false, error: error.message })
    }
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm" aria-labelledby="attendance-title" scroll="paper">
      <DialogTitle id="attendance-title">{t('Attendance: {title}', { title: t(item.title) })}</DialogTitle>
      <DialogContent dividers sx={{ display: 'grid', gap: 3 }}>
        <Typography color="text.secondary">
          {inWindow ? t('Tick today to mark that you did this challenge today, then save. Other days cannot be changed.') : t('Today is outside this challenge’s dates, so there is nothing to mark.')}
        </Typography>
        {months.map((month) => (
          <Box key={month.key} component="section" aria-label={monthName(month.key)}>
            <Typography sx={{ fontWeight: 700, mb: 1 }}>{monthName(month.key)}</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 0.75 }}>
              {Array.from({ length: weekday(month.days[0]) }).map((_, i) => <Box key={`pad${i}`} aria-hidden="true" />)}
              {month.days.map((d) => {
                const isToday = d === today
                const on = isToday ? tick : marked.has(d)
                const canTick = isToday && inWindow
                return (
                  <Box
                    key={d}
                    component={canTick ? 'button' : 'div'}
                    type={canTick ? 'button' : undefined}
                    onClick={canTick ? () => setTick((v) => !v) : undefined}
                    aria-label={`${d}${on ? `, ${t('attended')}` : ''}${isToday ? `, ${t('today')}` : ''}`}
                    aria-pressed={canTick ? on : undefined}
                    sx={{ aspectRatio: '1', borderRadius: '10px', display: 'grid', placeItems: 'center', font: 'inherit', fontSize: '0.8125rem', cursor: canTick ? 'pointer' : 'default', color: on ? '#FFFFFF' : d > today ? colors.textMuted : colors.textPrimary, bgcolor: on ? colors.success : 'transparent', border: `2px solid ${isToday ? colors.blue600 : on ? colors.success : colors.border}`, opacity: !isToday && !on ? 0.6 : 1, position: 'relative' }}
                  >
                    {on ? <Check size={16} aria-hidden="true" /> : Number(d.slice(8))}
                  </Box>
                )
              })}
            </Box>
          </Box>
        ))}
        <FormError message={state.error} />
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={close} disabled={state.busy}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={save} disabled={state.busy || !changed || !inWindow}>{state.busy ? t('Saving…') : t('Save attendance')}</Button>
      </DialogActions>
    </Dialog>
  )
}
