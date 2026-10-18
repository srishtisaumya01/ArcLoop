import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Alert, Box, Button, Container, Skeleton, Typography } from '@mui/material'
import { Check, Clock, Flame, LogIn, LogOut, Settings } from 'lucide-react'
import PageHeader from '../../components/common/PageHeader.jsx'
import StatePanel from '../../components/common/StatePanel.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useI18n } from '../../hooks/useI18n.js'
import { useNow } from '../../hooks/useNow.js'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { CHECKIN_CHANGED, checkIn, checkOut, getCheckin } from '../../services/checkinService.js'
import { ROUTES } from '../../constants/navigation.js'
import { colors, contentWidths, radii, shadows } from '../../theme/tokens.js'

const minutesBetween = (later, earlier) => Math.max(0, Math.round((later - earlier) / 60000))
const hoursMinutes = (minutes) => ({ h: Math.floor(minutes / 60), m: minutes % 60 })

// Marks attendance: check in once the shift has started, check out at least six hours later. Checking out too early is
// refused with a message to finish the shift. A day with both counts towards the streak.
export default function AttendancePage() {
  const { t, lang } = useI18n()
  usePageMeta(t('Mark Attendance'))
  const { status, data, retry } = useAsync(getCheckin)
  const now = useNow(undefined, 30_000)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null) // { severity, text }
  useEffect(() => {
    window.addEventListener(CHECKIN_CHANGED, retry)
    return () => window.removeEventListener(CHECKIN_CHANGED, retry)
  }, [retry])

  const time = (iso) => new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
  const run = async (action) => {
    setBusy(true)
    setMessage(null)
    try {
      await action()
    } catch (error) {
      setMessage({ severity: 'warning', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  let body = <Skeleton variant="rounded" height={260} />
  if (status === 'error' && !data) {
    body = <StatePanel tone="error" title={t('We couldn’t load your attendance')} text={t('Something went wrong while loading. Please try again.')} action={<Button variant="contained" onClick={retry}>{t('Try again')}</Button>} />
  }
  if (data) {
    const stage = data.checked_out_at ? 'done' : data.checked_in_at ? 'in' : 'out'
    const opens = new Date(data.check_in_opens_at)
    const notOpen = stage === 'out' && now < opens
    const earliest = data.earliest_check_out_at ? new Date(data.earliest_check_out_at) : null
    const worked = stage === 'done' ? hoursMinutes(minutesBetween(new Date(data.checked_out_at), new Date(data.checked_in_at))) : null
    const wait = stage === 'in' && earliest && now < earliest ? hoursMinutes(minutesBetween(earliest, now)) : null
    body = (
      <Box sx={{ display: 'grid', gap: 3, maxWidth: 640 }}>
        <Box sx={{ p: { xs: 2.5, md: 3.5 }, borderRadius: `${radii.lg}px`, border: `1px solid ${colors.border}`, bgcolor: colors.surface, boxShadow: shadows.md, display: 'grid', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: colors.blue600, fontWeight: 700 }}>
            <Clock size={18} aria-hidden="true" />
            {t('Your shift: {start} to {end}', { start: data.shift_start, end: data.shift_end })}
          </Box>

          {stage === 'out' && (
            <>
              <Typography variant="h3" component="h2">{notOpen ? t('Check-in opens at {time}', { time: data.shift_start }) : t('Ready to start your day?')}</Typography>
              <Typography color="text.secondary">{notOpen ? t('Come back when your shift starts to mark your attendance.') : t('Check in now. You can check out six hours after you check in.')}</Typography>
              <Box><Button variant="contained" size="large" startIcon={<LogIn size={18} aria-hidden="true" />} disabled={busy || notOpen} onClick={() => run(checkIn)}>{t('Check in')}</Button></Box>
            </>
          )}

          {stage === 'in' && (
            <>
              <Typography variant="h3" component="h2">{t('You checked in at {time}', { time: time(data.checked_in_at) })}</Typography>
              <Typography color="text.secondary">
                {wait ? t('You can check out after {time} ({h}h {m}m from now).', { time: time(data.earliest_check_out_at), h: wait.h, m: wait.m }) : t('Your shift is complete. You can check out now.')}
              </Typography>
              <Box><Button variant="contained" size="large" startIcon={<LogOut size={18} aria-hidden="true" />} disabled={busy} onClick={() => run(checkOut)}>{t('Check out')}</Button></Box>
            </>
          )}

          {stage === 'done' && (
            <>
              <Typography variant="h3" component="h2" sx={{ display: 'flex', alignItems: 'center', gap: 1, color: colors.success }}><Check size={24} aria-hidden="true" />{t('Attendance marked for today')}</Typography>
              <Typography color="text.secondary">{t('Checked in {inTime}, checked out {outTime}. You worked {h}h {m}m.', { inTime: time(data.checked_in_at), outTime: time(data.checked_out_at), h: worked.h, m: worked.m })}</Typography>
            </>
          )}

          {message && <Alert severity={message.severity} role="alert">{message.text}</Alert>}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Flame size={20} color="#F59E0B" aria-hidden="true" />
          <Typography sx={{ fontWeight: 700 }}>{t('{count}-day streak', { count: data.current_streak })}</Typography>
          <Typography color="text.secondary">{t('Best: {count} days', { count: data.best_streak })}</Typography>
          <Button component={RouterLink} to={ROUTES.settings} size="small" startIcon={<Settings size={16} aria-hidden="true" />} sx={{ ml: 'auto' }}>{t('Change shift hours')}</Button>
        </Box>
      </Box>
    )
  }

  return (
    <>
      <PageHeader eyebrow={t('Attendance')} title={t('Mark Attendance')} description={t('Check in when your shift starts and check out when it is done. A day with both keeps your streak alive.')} />
      <Container sx={{ maxWidth: `${contentWidths.page}px !important`, py: { xs: 4, md: 6 } }}>{body}</Container>
    </>
  )
}
