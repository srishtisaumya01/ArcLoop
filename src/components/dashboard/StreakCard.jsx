import { useEffect } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Skeleton, Typography } from '@mui/material'
import { Check, Flame, UserCheck } from 'lucide-react'
import ActivityGrid from '../rewards/ActivityGrid.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useI18n } from '../../hooks/useI18n.js'
import { CHECKIN_CHANGED, getCheckin } from '../../services/checkinService.js'
import { getRewards } from '../../services/rewardsService.js'
import { ROUTES } from '../../constants/navigation.js'
import { colors, radii, shadows } from '../../theme/tokens.js'

// The daily streak. It grows by one for each day the person checks in and checks out, and breaks when a day passes without both.
export default function StreakCard() {
  const { t } = useI18n()
  const { status, data, retry } = useAsync(getCheckin)
  const rewards = useAsync(getRewards)
  const { retry: retryRewards } = rewards
  useEffect(() => {
    const again = () => {
      retry()
      retryRewards()
    }
    window.addEventListener(CHECKIN_CHANGED, again)
    return () => window.removeEventListener(CHECKIN_CHANGED, again)
  }, [retry, retryRewards])

  if (status === 'loading' && !data) return <Skeleton variant="rounded" height={190} />
  if (!data) return null

  const stage = data.checked_out_at || data.challenge_marked_today ? 'done' : data.checked_in_at ? 'in' : 'out'
  const message =
    stage === 'done'
      ? t('Done for today. Your streak is safe.')
      : stage === 'in'
        ? t('You are checked in. Check out after your shift to keep your streak.')
        : data.current_streak > 0
          ? t('Mark your attendance today to keep your streak going.')
          : t('Check in and check out every day to start a streak.')

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
      {rewards.data && (
        <Box>
          <Typography sx={{ fontWeight: 700, mb: 1 }}>{t('{count} active days in the past year', { count: rewards.data.activity.length })}</Typography>
          <ActivityGrid activity={rewards.data.activity} today={rewards.data.today} />
        </Box>
      )}
      <Typography variant="body2" color="text.secondary">{message}</Typography>
      <Box>
        <Button component={RouterLink} to={ROUTES.attendance} variant={stage === 'done' ? 'outlined' : 'contained'} size="small" startIcon={stage === 'done' ? <Check size={16} aria-hidden="true" /> : <UserCheck size={16} aria-hidden="true" />}>
          {stage === 'done' ? t('Attendance marked') : t('Mark attendance')}
        </Button>
      </Box>
    </Box>
  )
}
