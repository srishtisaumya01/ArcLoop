import { useEffect, useState } from 'react'
import { Box, Button, Skeleton, Typography } from '@mui/material'
import { Check, Flame, LogIn, LogOut } from 'lucide-react'
import FormError from '../auth/FormError.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useI18n } from '../../hooks/useI18n.js'
import { CHECKIN_CHANGED, checkIn, checkOut, getCheckin } from '../../services/checkinService.js'
import { colors, radii, shadows } from '../../theme/tokens.js'

// The daily streak. It grows by one for each day the person checks in and checks out, and breaks when a day passes without both.
export default function StreakCard() {
  const { t, lang } = useI18n()
  const { status, data, retry } = useAsync(getCheckin)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  useEffect(() => {
    window.addEventListener(CHECKIN_CHANGED, retry)
    return () => window.removeEventListener(CHECKIN_CHANGED, retry)
  }, [retry])

  if (status === 'loading' && !data) return <Skeleton variant="rounded" height={190} />
  if (!data) return null

  const stage = data.checked_out_at ? 'done' : data.checked_in_at ? 'in' : 'out'
  const run = async (action) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  const dayLetter = (iso) => new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-GB', { weekday: 'narrow' }).format(new Date(`${iso}T12:00:00`))
  const message =
    stage === 'done'
      ? t('Done for today. Your streak is safe.')
      : stage === 'in'
        ? t('Check out when you are done for the day to keep your streak.')
        : data.current_streak > 0
          ? t('Check in and check out today to keep your streak going.')
          : t('Check in and check out each day to start a streak.')

  return (
    <Box sx={{ p: 2.5, borderRadius: `${radii.lg}px`, border: `1px solid ${colors.border}`, bgcolor: colors.surface, boxShadow: shadows.sm, display: 'grid', gap: 1.25, alignContent: 'start' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box aria-hidden="true" sx={{ width: 44, height: 44, borderRadius: '12px', display: 'grid', placeItems: 'center', color: '#FFFFFF', background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }}>
          <Flame size={24} />
        </Box>
        <Box>
          <Typography component="p" sx={{ fontSize: '1.75rem', fontWeight: 800, lineHeight: 1.1 }}>{t('{count}-day streak', { count: data.current_streak })}</Typography>
          <Typography variant="body2" color="text.secondary">{t('Best: {count} days', { count: data.best_streak })}</Typography>
        </Box>
      </Box>
      <Box role="list" aria-label={t('Last 7 days')} sx={{ display: 'flex', gap: 0.75 }}>
        {data.last_days.map((d) => (
          <Box role="listitem" key={d.date} aria-label={`${d.date}: ${d.done ? t('done') : t('not done')}`} sx={{ display: 'grid', justifyItems: 'center', gap: 0.25, flex: 1 }}>
            <Box sx={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', color: '#FFFFFF', bgcolor: d.done ? colors.success : 'transparent', border: `2px solid ${d.done ? colors.success : colors.border}` }}>
              {d.done && <Check size={14} aria-hidden="true" />}
            </Box>
            <Typography variant="caption" color="text.secondary">{dayLetter(d.date)}</Typography>
          </Box>
        ))}
      </Box>
      <Typography variant="body2" color="text.secondary">{message}</Typography>
      <FormError message={error} />
      <Box>
        {stage === 'out' && <Button variant="contained" size="small" startIcon={<LogIn size={16} aria-hidden="true" />} disabled={busy} onClick={() => run(checkIn)}>{t('Check in')}</Button>}
        {stage === 'in' && <Button variant="contained" size="small" startIcon={<LogOut size={16} aria-hidden="true" />} disabled={busy} onClick={() => run(checkOut)}>{t('Check out')}</Button>}
        {stage === 'done' && <Button variant="outlined" size="small" startIcon={<Check size={16} aria-hidden="true" />} disabled>{t('Checked out')}</Button>}
      </Box>
    </Box>
  )
}
