import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Chip, Container, LinearProgress, Skeleton, Typography } from '@mui/material'
import { ChartNoAxesColumn, RefreshCw, TriangleAlert } from 'lucide-react'
import PageHeader from '../../components/common/PageHeader.jsx'
import StatePanel from '../../components/common/StatePanel.jsx'
import { formatRange } from '../../components/planner/weekFormat.js'
import { HABIT_WINDOW_DAYS, useProgressOverview } from '../../hooks/useProgressOverview.js'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { ROUTES } from '../../constants/navigation.js'
import { colors, contentWidths, radii } from '../../theme/tokens.js'

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function Section({ title, description, children, ...rest }) {
  return (
    <Box component="section" {...rest} sx={{ display: 'grid', gap: 1.5 }}>
      <Box>
        <Typography variant="h3" component="h2">{title}</Typography>
        {description && <Typography variant="body2" color="text.secondary">{description}</Typography>}
      </Box>
      {children}
    </Box>
  )
}

const rowSx = { p: 2, borderRadius: `${radii.md}px`, border: `1px solid ${colors.border}`, bgcolor: colors.surface, display: 'grid', gap: 1 }

function WeekRow({ week }) {
  const quiet = week.daysWithPlan === 0 && week.upcomingTasks === 0
  return (
    <Box component="li" sx={rowSx}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography component="h3" variant="h4">
          {formatRange(week.weekStart, week.weekEnd)}
        </Typography>
        <Button size="small" component={RouterLink} to={`${ROUTES.week}?week=${week.weekStart}`} aria-label={`View week of ${formatRange(week.weekStart, week.weekEnd)}`}>View week</Button>
      </Box>
      {week.isCurrentWeek && (
        <Box>
          <Chip size="small" color="primary" label="This week" />
        </Box>
      )}
      {quiet ? (
        <Typography variant="body2" color="text.secondary">Nothing planned this week.</Typography>
      ) : (
        <>
          <Typography variant="body2" color="text.secondary">
            {plural(week.daysWithProgress, 'day')} with progress · {plural(week.tasksDone, 'task')} done
            {week.tasksPartial ? ` · ${week.tasksPartial} partly done` : ''}
            {week.restDays ? ` · ${plural(week.restDays, 'rest day')}` : ''}
          </Typography>
          {week.eligible && week.averagePercent !== null && (
            <Box>
              <LinearProgress variant="determinate" value={week.averagePercent} aria-label={`Average completion ${week.averagePercent}%`} sx={{ height: 8, borderRadius: 4 }} />
              <Typography variant="caption" color="text.secondary">Average completion {week.averagePercent}% (rest days not counted)</Typography>
            </Box>
          )}
        </>
      )}
    </Box>
  )
}

function HabitRow({ habit }) {
  return (
    <Box component="li" sx={rowSx}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography component="h3" variant="h4" sx={{ overflowWrap: 'anywhere' }}>{habit.title}</Typography>
        {habit.archived && <Chip size="small" variant="outlined" label="Ended" />}
      </Box>
      <Typography variant="body2" color="text.secondary">
        {habit.done} of {plural(habit.planned, 'planned day')} done
        {habit.partial ? `, ${habit.partial} partly done` : ''}
      </Typography>
      <Box>
        <LinearProgress variant="determinate" value={habit.percent ?? 0} aria-label={`${habit.title}: ${habit.percent ?? 0}%`} sx={{ height: 8, borderRadius: 4 }} />
        <Typography variant="caption" color="text.secondary">{habit.percent ?? 0}%</Typography>
      </Box>
    </Box>
  )
}

// Progress: how recent weeks and each repeating task have gone, straight from the planner's own
// calculations. No streaks, rankings or scores to beat (by design).
export default function ProgressPage() {
  usePageMeta('Your progress')
  const { status, data, refresh } = useProgressOverview()
  const nothing = data && data.habits.habits.length === 0 && data.weeks.every((w) => w.daysWithPlan === 0 && w.upcomingTasks === 0)

  return (
    <>
      <PageHeader eyebrow="Progress" title="Your progress" description="How your weeks and repeating tasks are going. A quiet day is just a day; what matters is the direction you’re heading." />
      <Container sx={{ maxWidth: `${contentWidths.page}px !important`, py: { xs: 4, md: 6 }, display: 'grid', gap: 4 }}>
        {status === 'loading' && (
          <Box aria-busy="true" aria-label="Loading your progress" sx={{ display: 'grid', gap: 2 }}>
            <Skeleton variant="rounded" height={90} />
            <Skeleton variant="rounded" height={90} />
            <Skeleton variant="rounded" height={90} />
          </Box>
        )}
        {status === 'error' && !data && (
          <StatePanel tone="error" icon={TriangleAlert} title="We couldn’t load your progress" text="Something went wrong while loading. Your plans are safe. Please try again."
            action={<Button variant="contained" startIcon={<RefreshCw size={18} aria-hidden="true" />} onClick={refresh}>Try again</Button>} />
        )}
        {status === 'error' && data && (
          <StatePanel tone="error" icon={TriangleAlert} title="We couldn’t refresh your progress" text="Showing what we loaded earlier."
            action={<Button variant="outlined" startIcon={<RefreshCw size={18} aria-hidden="true" />} onClick={refresh}>Try again</Button>} />
        )}
        {nothing && (
          <StatePanel icon={ChartNoAxesColumn} title="Nothing to show yet" text="Plan a few days in My Day and your weeks and repeating tasks will show up here."
            action={<Button component={RouterLink} to={ROUTES.day} variant="contained">Open My Day</Button>} />
        )}
        {data && !nothing && (
          <>
            <Section title="Recent weeks" description="Newest first. Each week uses the same numbers as the weekly overview." aria-label="Recent weeks">
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, alignItems: 'start' }}>
                {data.weeks.map((week) => <WeekRow key={week.weekStart} week={week} />)}
              </Box>
            </Section>
            <Section title="Your recurring tasks" description={`The last ${HABIT_WINDOW_DAYS} days. Rest days, and tasks you moved or set aside, are not counted.`} aria-label="Recurring tasks">
              {data.habits.habits.length === 0 ? (
                <Typography color="text.secondary">No recurring task was planned in this period.</Typography>
              ) : (
                <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, alignItems: 'start' }}>
                  {data.habits.habits.map((habit) => <HabitRow key={habit.templateId} habit={habit} />)}
                </Box>
              )}
            </Section>
          </>
        )}
      </Container>
    </>
  )
}
