import { useEffect, useState } from 'react'
import { Box, Button, ButtonBase, Container, Skeleton, Typography } from '@mui/material'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import PageHeader from '../../components/common/PageHeader.jsx'
import StatePanel from '../../components/common/StatePanel.jsx'
import StreakPanel from '../../components/rewards/StreakPanel.jsx'
import BadgeDialog from '../../components/rewards/BadgeDialog.jsx'
import BadgeHex from '../../components/rewards/BadgeHex.jsx'
import { useAppShell } from '../../hooks/useAppShell.js'
import { useAsync } from '../../hooks/useAsync.js'
import { useI18n } from '../../hooks/useI18n.js'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { CHECKIN_CHANGED } from '../../services/checkinService.js'
import { getRewards } from '../../services/rewardsService.js'
import { formatDate } from '../../utils/appDates.js'
import { useStreakTheme } from '../../components/rewards/streakTheme.js'
import { contentWidths, radii } from '../../theme/tokens.js'

// Rewards: the streak badges (earned ones to keep and share, locked ones to aim for) and a year of activity.
export default function RewardsPage() {
  const { t, lang } = useI18n()
  const p = useStreakTheme()
  usePageMeta(t('Rewards'))
  const { profile, displayName } = useAppShell()
  const { status, data, retry } = useAsync(getRewards)
  const [open, setOpen] = useState(null)
  useEffect(() => {
    window.addEventListener(CHECKIN_CHANGED, retry)
    return () => window.removeEventListener(CHECKIN_CHANGED, retry)
  }, [retry])
  const username = profile?.username ?? displayName
  const earned = data?.badges.filter((b) => b.earned_on) ?? []

  return (
    <>
      <PageHeader eyebrow={t('Rewards')} title={t('Your rewards')} description={t('Keep your streak going to earn badges. Mark attendance in any challenge each day.')} />
      <Container sx={{ maxWidth: `${contentWidths.page}px !important`, py: { xs: 4, md: 6 }, display: 'grid', gap: 3 }}>
        {status === 'loading' && !data && <Skeleton variant="rounded" height={320} />}
        {status === 'error' && !data && (
          <StatePanel tone="error" icon={TriangleAlert} title={t('We couldn’t load your rewards')} text={t('Something went wrong while loading. Please try again.')}
            action={<Button variant="contained" startIcon={<RefreshCw size={18} aria-hidden="true" />} onClick={retry}>{t('Try again')}</Button>} />
        )}
        {data && (
          <>
            <Box component="section" aria-labelledby="badges-title" sx={{ p: { xs: 2.5, md: 3 }, borderRadius: `${radii.lg}px`, bgcolor: p.card, color: p.text, border: `1px solid ${p.border}`, boxShadow: p.shadow }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 1, mb: 2.5 }}>
                <Typography id="badges-title" variant="h3" component="h2" sx={{ color: p.strong }}>{t('Badges')}</Typography>
                <Typography sx={{ color: p.muted }}>{t('{done} of {total} earned', { done: earned.length, total: data.badges.length })}</Typography>
              </Box>
              <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', md: 'repeat(5, minmax(0, 1fr))' } }}>
                {data.badges.map((b) => {
                  const left = b.days - data.current_streak
                  const body = (
                    <>
                      <BadgeHex days={b.days} locked={!b.earned_on} progress={data.current_streak / b.days} size={116} />
                      <Typography sx={{ fontWeight: 700, color: p.strong }}>{t(b.title)}</Typography>
                      <Typography variant="body2" sx={{ color: p.muted }}>
                        {b.earned_on ? formatDate(b.earned_on, lang) : left > 0 ? `${data.current_streak}/${b.days} · ${t('{count} days to go', { count: left })}` : t('Locked')}
                      </Typography>
                    </>
                  )
                  return b.earned_on ? (
                    <ButtonBase key={b.code} onClick={() => setOpen(b)} aria-label={t('Open {title} badge', { title: t(b.title) })} sx={{ display: 'grid', justifyItems: 'center', gap: 0.5, p: 1, borderRadius: '14px', '&:hover': { bgcolor: 'rgba(128,128,128,0.12)' } }}>{body}</ButtonBase>
                  ) : (
                    <Box key={b.code} sx={{ display: 'grid', justifyItems: 'center', gap: 0.5, p: 1 }}>{body}</Box>
                  )
                })}
              </Box>
            </Box>

            <StreakPanel data={data} />
          </>
        )}
      </Container>
      {open && <BadgeDialog badge={open} username={username} open onClose={() => setOpen(null)} />}
    </>
  )
}
