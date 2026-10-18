import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Container, Skeleton } from '@mui/material'
import { CalendarCheck, CalendarRange, CircleCheck, ListTodo, RefreshCw, TrendingUp, TriangleAlert, Trophy } from 'lucide-react'
import UserMenu from '../../components/app/UserMenu.jsx'
import QuoteCard from '../../components/dashboard/QuoteCard.jsx'
import GreetingBand from '../../components/dashboard/GreetingBand.jsx'
import StreakCard from '../../components/dashboard/StreakCard.jsx'
import ChallengeCounts from '../../components/dashboard/ChallengeCounts.jsx'
import KpiTiles from '../../components/dashboard/KpiTiles.jsx'
import TodayCard from '../../components/dashboard/TodayCard.jsx'
import WeekCard from '../../components/dashboard/WeekCard.jsx'
import TrendCard from '../../components/dashboard/TrendCard.jsx'
import HabitsCard from '../../components/dashboard/HabitsCard.jsx'
import ChallengeCard from '../../components/dashboard/ChallengeCard.jsx'
import FirstSteps from '../../components/dashboard/FirstSteps.jsx'
import StatePanel from '../../components/common/StatePanel.jsx'
import { useAppShell } from '../../hooks/useAppShell.js'
import { useI18n } from '../../hooks/useI18n.js'
import { useNow } from '../../hooks/useNow.js'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { useMyChallenges } from '../../hooks/useMyChallenges.js'
import { useProgressOverview } from '../../hooks/useProgressOverview.js'
import { firstNameOf, greetingFor } from '../../utils/greeting.js'
import { isBrandNew, summarizeToday, topHabits, trendPoints, weekBars } from '../../utils/dashboard.js'
import { ROUTES } from '../../constants/navigation.js'
import { contentWidths } from '../../theme/tokens.js'

// One sentence about how today stands.
// The signed-in home: a greeting for the time of day, today at a glance, the week, the trend, and the featured challenge.
export default function DashboardPage() {
  const { t, lang } = useI18n()
  usePageMeta(t('Dashboard'))
  const now = useNow(undefined, 60_000)
  const { displayName, profileStatus } = useAppShell()
  const { status, data, refresh } = useProgressOverview()
  const mine = useMyChallenges()

  const week = data?.weeks[0] ?? null
  const today = summarizeToday(week)
  const brandNew = isBrandNew(data)
  const first = firstNameOf(displayName) || displayName
  const dateLabel = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).format(now)

  const tiles = week
    ? [
        { key: 'today', icon: CircleCheck, label: t('Done today'), value: today?.count ? today.done : null, note: today?.count ? t('of {count} tasks', { count: today.count }) : t('Nothing planned yet') },
        { key: 'average', icon: TrendingUp, label: t('Weekly average'), value: week.eligible && week.averagePercent !== null ? week.averagePercent : null, suffix: '%', note: week.eligible ? t('Average completion this week') : t('Shows once 3 days are planned') },
        { key: 'progress', icon: CalendarCheck, label: t('Days with progress'), value: week.daysWithProgress, note: t('this week, out of 7') },
        { key: 'left', icon: ListTodo, label: t('Still to do'), value: week.tasksRemaining, note: t('tasks on days so far this week') },
      ]
    : []

  const quote = (sx) => <QuoteCard now={now} sx={sx} />
  const goToOngoing = () => document.getElementById('ongoing-challenges')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <>
      <GreetingBand
        greeting={greetingFor(now)}
        name={first}
        dateLabel={dateLabel}
        ready={profileStatus !== 'loading'}
        account={<UserMenu onDark />}
        quote={quote({ display: { xs: 'none', xl: 'block' }, position: 'absolute', bottom: 16, right: 32, width: 380, flex: 'none', ml: 0, zIndex: 1 })}
      />

      <Container sx={{ maxWidth: `${contentWidths.page}px !important`, py: { xs: 3, md: 5 }, display: 'grid', gap: 3 }}>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button component={RouterLink} to={ROUTES.day} variant="contained" color="primary" startIcon={<CalendarCheck size={18} aria-hidden="true" />}>
            {t('Open My Day')}
          </Button>
          <Button component={RouterLink} to={ROUTES.week} variant="outlined" color="primary" startIcon={<CalendarRange size={18} aria-hidden="true" />}>
            {t('Plan your week')}
          </Button>
          <Button variant="outlined" color="primary" startIcon={<Trophy size={18} aria-hidden="true" />} onClick={goToOngoing}>
            {mine.status === 'success' ? t('Ongoing challenges ({count})', { count: mine.ongoing.length }) : t('Ongoing challenges')}
          </Button>
        </Box>
        {quote({ display: { xs: 'block', xl: 'none' }, flex: 'none', ml: 0 })}
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' } }}>
          <StreakCard />
          <ChallengeCounts status={mine.status} items={mine.items} />
        </Box>
        {status === 'loading' && !data && (
          <Box aria-busy="true" aria-label={t('Loading your dashboard')} sx={{ display: 'grid', gap: 3 }}>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' } }}>
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={132} />)}
            </Box>
            <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' } }}>
              <Skeleton variant="rounded" height={300} />
              <Skeleton variant="rounded" height={300} />
            </Box>
          </Box>
        )}

        {status === 'error' && !data && (
          <StatePanel
            tone="error"
            icon={TriangleAlert}
            title={t('We couldn’t load your dashboard')}
            text={t('Something went wrong while loading. Your plans are safe. Please try again.')}
            action={
              <Button variant="contained" color="primary" startIcon={<RefreshCw size={18} aria-hidden="true" />} onClick={refresh}>
                {t('Try again')}
              </Button>
            }
          />
        )}

        {data && (
          <>
            {brandNew ? (
              <FirstSteps />
            ) : (
              <>
                <KpiTiles tiles={tiles} />
                <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' } }}>
                  <TodayCard today={today} />
                  <WeekCard bars={weekBars(week)} weekStart={week?.weekStart} weekEnd={week?.weekEnd} />
                </Box>
                <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1.5fr) minmax(0, 1fr)' }, alignItems: 'start' }}>
                  <TrendCard points={trendPoints(data.weeks)} />
                  <Box sx={{ display: 'grid', gap: 3 }}>
                    <ChallengeCard status={mine.status} ongoing={mine.ongoing} />
                    <HabitsCard habits={topHabits(data.habits.habits)} />
                  </Box>
                </Box>
              </>
            )}
          </>
        )}

        {brandNew && <ChallengeCard status={mine.status} ongoing={mine.ongoing} />}
      </Container>
    </>
  )
}
