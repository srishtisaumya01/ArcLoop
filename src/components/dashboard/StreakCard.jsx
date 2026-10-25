import { useEffect } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Skeleton, Typography } from '@mui/material'
import { Check, UserCheck } from 'lucide-react'
import StreakPanel from '../rewards/StreakPanel.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useI18n } from '../../hooks/useI18n.js'
import { CHECKIN_CHANGED, getCheckin } from '../../services/checkinService.js'
import { getRewards } from '../../services/rewardsService.js'
import { ROUTES } from '../../constants/navigation.js'

// The daily streak on the dashboard: figures, activity grid and graph on a black panel, with today's attendance below.
export default function StreakCard() {
  const { t } = useI18n()
  const checkin = useAsync(getCheckin)
  const rewards = useAsync(getRewards)
  const { retry: retryCheckin } = checkin
  const { retry: retryRewards } = rewards
  useEffect(() => {
    const again = () => {
      retryCheckin()
      retryRewards()
    }
    window.addEventListener(CHECKIN_CHANGED, again)
    return () => window.removeEventListener(CHECKIN_CHANGED, again)
  }, [retryCheckin, retryRewards])

  if (rewards.status === 'loading' && !rewards.data) return <Skeleton variant="rounded" height={420} />
  if (!rewards.data) return null

  const data = checkin.data
  const stage = data?.checked_out_at || data?.challenge_marked_today ? 'done' : data?.checked_in_at ? 'in' : 'out'
  const message =
    stage === 'done'
      ? t('Done for today. Your streak is safe.')
      : stage === 'in'
        ? t('You are checked in. Check out after your shift to keep your streak.')
        : rewards.data.current_streak > 0
          ? t('Mark your attendance today to keep your streak going.')
          : t('Mark your attendance every day to start a streak.')

  return (
    <StreakPanel data={rewards.data}>
      {rewards.data.has_enrollment && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Button component={RouterLink} to={ROUTES.attendance} variant={stage === 'done' ? 'outlined' : 'contained'} size="small" startIcon={stage === 'done' ? <Check size={16} aria-hidden="true" /> : <UserCheck size={16} aria-hidden="true" />} sx={stage === 'done' ? { color: '#E6EDF3', borderColor: '#30363D' } : { bgcolor: '#238636', color: '#FFFFFF', '&:hover': { bgcolor: '#2EA043' } }}>
            {stage === 'done' ? t('Attendance marked') : t('Mark attendance')}
          </Button>
          <Typography variant="body2" sx={{ color: '#8B949E' }}>{message}</Typography>
        </Box>
      )}
    </StreakPanel>
  )
}
