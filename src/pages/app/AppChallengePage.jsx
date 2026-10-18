import { useCallback, useState } from 'react'
import { Link as RouterLink, useParams } from 'react-router-dom'
import { Box, Button, Container, Skeleton, Typography } from '@mui/material'
import { Check, FileQuestion, LogOut, RefreshCw, TriangleAlert, UserPlus } from 'lucide-react'
import PageHeader from '../../components/common/PageHeader.jsx'
import StatePanel from '../../components/common/StatePanel.jsx'
import EnrollDialog from '../../components/myChallenges/EnrollDialog.jsx'
import MyChallengeCard from '../../components/myChallenges/MyChallengeCard.jsx'
import FormError from '../../components/auth/FormError.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useI18n } from '../../hooks/useI18n.js'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { getAppChallenge, leaveChallenge } from '../../services/myChallengesService.js'
import { ROUTES } from '../../constants/navigation.js'
import { challengeClock } from '../../utils/challengeClock.js'
import { contentWidths, colors, onBrandButtons } from '../../theme/tokens.js'

function List({ items }) {
  const { t } = useI18n()
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.25 }}>
      {items.map((item) => (
        <Box component="li" key={item} sx={{ display: 'flex', gap: 1.5 }}>
          <Box sx={{ color: colors.blue600, mt: '3px', flexShrink: 0 }}><Check size={20} aria-hidden="true" /></Box>
          <Typography>{t(item)}</Typography>
        </Box>
      ))}
    </Box>
  )
}

// A challenge's details, read before joining. "Enroll challenge" asks solo or group; once joined, the page shows the person's
// own dates, group and a way to leave.
export default function AppChallengePage() {
  const { t } = useI18n()
  const { slug } = useParams()
  const load = useCallback(() => getAppChallenge(slug), [slug])
  const { status, data: challenge, retry } = useAsync(load)
  const [enrolling, setEnrolling] = useState(false)
  const [leaveState, setLeaveState] = useState({ busy: false, error: null })
  usePageMeta(challenge ? t(challenge.title) : t('Challenge'))

  if (status === 'loading') return <Container sx={{ py: 6 }}><Skeleton variant="rounded" height={320} /></Container>
  if (status === 'error')
    return (
      <Container sx={{ py: 6 }}>
        <StatePanel tone="error" headingLevel={1} icon={TriangleAlert} title={t('We couldn’t load this challenge')} text={t('Something went wrong while loading. Please try again.')}
          action={<Button variant="contained" startIcon={<RefreshCw size={18} aria-hidden="true" />} onClick={retry}>{t('Try again')}</Button>} />
      </Container>
    )
  if (!challenge)
    return (
      <Container sx={{ py: 6 }}>
        <StatePanel headingLevel={1} icon={FileQuestion} title={t('Challenge not found')} text={t('This challenge doesn’t exist, or the link is out of date.')}
          action={<Button component={RouterLink} to={ROUTES.appChallenges} variant="contained">{t('All challenges')}</Button>} />
      </Container>
    )

  const enrollment = challenge.enrollment
  const mineItem = enrollment
    ? { ...challenge, clock: challengeClock({ startDate: enrollment.start_date, totalDays: Math.round((new Date(enrollment.end_date) - new Date(enrollment.start_date)) / 86_400_000) + 1 }) }
    : null
  const ended = challenge.end_date && new Date(challenge.end_date) < new Date(new Date().toDateString())
  const leave = async () => {
    setLeaveState({ busy: true, error: null })
    try {
      await leaveChallenge(challenge.slug)
      if (challenge.kind === 'custom') window.location.assign(ROUTES.appChallenges)
      else {
        setLeaveState({ busy: false, error: null })
        retry()
      }
    } catch (error) {
      setLeaveState({ busy: false, error: error.message })
    }
  }

  return (
    <>
      <PageHeader eyebrow={t(challenge.category)} title={t(challenge.title)} description={t(challenge.summary)} back={{ to: ROUTES.appChallenges, label: t('All challenges') }}>
        {!enrollment && !ended && (
          <Button variant="contained" size="large" startIcon={<UserPlus size={18} aria-hidden="true" />} onClick={() => setEnrolling(true)} sx={onBrandButtons.solid}>
            {t('Enroll challenge')}
          </Button>
        )}
        {!enrollment && ended && <Typography sx={{ color: '#FFFFFF' }}>{t('This challenge has ended.')}</Typography>}
      </PageHeader>
      {enrolling && <EnrollDialog challenge={challenge} open onClose={() => setEnrolling(false)} onEnrolled={() => { setEnrolling(false); retry() }} />}

      <Container sx={{ maxWidth: `${contentWidths.page}px !important`, py: { xs: 4, md: 6 }, display: 'grid', gap: 4 }}>
        {mineItem && (
          <Box sx={{ display: 'grid', gap: 2, maxWidth: 640 }}>
            <MyChallengeCard item={mineItem} />
            <FormError message={leaveState.error} />
            <Box><Button variant="outlined" color="inherit" size="small" startIcon={<LogOut size={16} aria-hidden="true" />} disabled={leaveState.busy} onClick={leave}>{challenge.kind === 'custom' ? t('Delete this challenge') : t('Leave challenge')}</Button></Box>
          </Box>
        )}
        {challenge.description && (
          <Box component="section"><Typography variant="h3" component="h2" sx={{ mb: 1.5 }}>{t('About this challenge')}</Typography><Typography color="text.secondary">{t(challenge.description)}</Typography></Box>
        )}
        {challenge.rules.length > 0 && <Box component="section"><Typography variant="h3" component="h2" sx={{ mb: 1.5 }}>{t('Rules')}</Typography><List items={challenge.rules} /></Box>}
        {challenge.habits.length > 0 && <Box component="section"><Typography variant="h3" component="h2" sx={{ mb: 1.5 }}>{t('Habits and goals')}</Typography><List items={challenge.habits} /></Box>}
        {challenge.scoring && <Box component="section"><Typography variant="h3" component="h2" sx={{ mb: 1.5 }}>{t('How progress is counted')}</Typography><Typography color="text.secondary">{t(challenge.scoring)}</Typography></Box>}
      </Container>
    </>
  )
}
