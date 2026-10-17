import { useCallback } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { Box, Button, Container, Skeleton, Typography } from '@mui/material'
import { CalendarDays, RefreshCw, TriangleAlert } from 'lucide-react'
import PageHeader from '../../components/common/PageHeader.jsx'
import StatePanel from '../../components/common/StatePanel.jsx'
import WeekNavigator from '../../components/planner/WeekNavigator.jsx'
import WeekSummary from '../../components/planner/WeekSummary.jsx'
import DayCard from '../../components/planner/DayCard.jsx'
import DayDetail from '../../components/planner/DayDetail.jsx'
import { useDismissible } from '../../hooks/useDismissible.js'
import { useWeekOverview } from '../../hooks/useWeekOverview.js'
import GentleNote from '../../components/planner/GentleNote.jsx'
import { WEEK_NOTE } from '../../constants/recoveryCopy.js'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { PLANNER_CONFIG, addDays, diffDays, isValidDate, missedDaysInWeek, startOfWeek } from '../../utils/planner/index.js'
import { ROUTES } from '../../constants/navigation.js'
import { contentWidths } from '../../theme/tokens.js'

// Weekly Overview: Monday to Sunday of the week in ?week=YYYY-MM-DD (default: this week), with
// ?day= selecting a day. All numbers come from plannerService.getWeekSummary; nothing is
// recomputed here.
export default function WeeklyOverviewPage() {
  usePageMeta('Your week')
  const [params, setParams] = useSearchParams()
  const weekParam = params.get('week')
  const weekOf = weekParam && isValidDate(weekParam) ? startOfWeek(weekParam) : undefined
  const { status, data: week, refresh } = useWeekOverview(weekOf)

  const update = useCallback(
    (next) => {
      setParams((prev) => {
        const p = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(next)) {
          if (v) p.set(k, v)
          else p.delete(k)
        }
        return p
      })
    },
    [setParams],
  )

  const goToWeek = (start) => update({ week: start, day: null })
  const canGoNext = !week || diffDays(week.today, addDays(week.weekStart, 7)) <= PLANNER_CONFIG.planAheadDays
  // The note is relevant only when this week has a past planned day with no progress.
  const [noteDismissed, dismissNote] = useDismissible(`weekNote:${week?.weekStart ?? 'none'}`)
  const showNote = Boolean(week) && missedDaysInWeek(week).length > 0 && !noteDismissed
  const selected = week?.days.find((d) => d.date === params.get('day')) ?? null
  const nothingPlanned = week && week.daysWithPlan === 0 && week.upcomingTasks === 0 && week.days.every((d) => d.kind !== 'planned' && d.kind !== 'rest')

  return (
    <>
      <PageHeader eyebrow="Weekly overview" title="Your week" description="See what is planned, what you have done, and what is coming up. Progress, not perfection." />
      <Container sx={{ maxWidth: `${contentWidths.page}px !important`, py: { xs: 4, md: 6 }, display: 'grid', gap: 4 }}>
        {status === 'loading' && (
          <Box aria-busy="true" aria-label="Loading your week" sx={{ display: 'grid', gap: 3 }}>
            <Skeleton variant="rounded" height={48} />
            <Skeleton variant="rounded" height={90} />
            <Skeleton variant="rounded" height={140} />
          </Box>
        )}
        {status === 'error' && !week && (
          <StatePanel
            tone="error"
            icon={TriangleAlert}
            title="We couldn’t load this week"
            text="Something went wrong while loading. Your plans are safe. Please try again."
            action={
              <Button variant="contained" startIcon={<RefreshCw size={18} aria-hidden="true" />} onClick={refresh}>
                Try again
              </Button>
            }
          />
        )}
        {week && (
          <>
            <Box><Button component={RouterLink} to={ROUTES.progress} size="small" variant="text" sx={{ ml: -1.25 }}>See recent weeks and recurring tasks</Button></Box>
            <WeekNavigator
              weekStart={week.weekStart}
              weekEnd={week.weekEnd}
              isCurrentWeek={week.isCurrentWeek}
              canGoNext={canGoNext}
              onPrevious={() => goToWeek(addDays(week.weekStart, -7))}
              onNext={() => goToWeek(addDays(week.weekStart, 7))}
              onToday={() => update({ week: null, day: null })}
            />
            {status === 'error' && (
              <StatePanel
                tone="error"
                icon={TriangleAlert}
                title="We couldn’t refresh this week"
                text="Showing what we loaded earlier."
                action={
                  <Button variant="outlined" startIcon={<RefreshCw size={18} aria-hidden="true" />} onClick={refresh}>
                    Try again
                  </Button>
                }
              />
            )}
            {nothingPlanned && (
              <StatePanel icon={CalendarDays} title="Nothing planned this week" text="There are no plans recorded for these days. That is fine; a quiet week is still a week." />
            )}
            {showNote && <GentleNote label="After missed days" {...WEEK_NOTE} onDismiss={dismissNote} />}
            <WeekSummary week={week} minDays={PLANNER_CONFIG.minPlannedDaysForWeeklySummary} />
            <Box component="section" aria-label="Days of the week">
              <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)', lg: 'repeat(7, 1fr)' } }}>
                {week.days.map((entry) => (
                  <DayCard key={entry.date} entry={entry} isToday={entry.date === week.today} selected={selected?.date === entry.date} onSelect={(date) => update({ day: date })} />
                ))}
              </Box>
            </Box>
            {selected ? <DayDetail entry={selected} /> : <Typography color="text.secondary">Select a day to see its plan.</Typography>}
          </>
        )}
      </Container>
    </>
  )
}
