import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, NativeSelect, Typography } from '@mui/material'
import { Trophy } from 'lucide-react'
import ActivityGrid from './ActivityGrid.jsx'
import ChallengeGraph from './ChallengeGraph.jsx'
import StreakStats from './StreakStats.jsx'
import { useI18n } from '../../hooks/useI18n.js'
import { ROUTES } from '../../constants/navigation.js'
import { addDaysIso, formatDate } from '../../utils/appDates.js'

// The streak figures, the activity grid and the challenge graph on one black panel. They start the month the person joined their
// first challenge; the year filter shows a whole calendar year instead. Before any challenge is joined there is nothing to show.
export default function StreakPanel({ data, children }) {
  const { t, lang } = useI18n()
  const [year, setYear] = useState('current')

  if (!data.has_enrollment) {
    return (
      <Box sx={{ p: 3, borderRadius: '20px', bgcolor: '#0D1117', color: '#E6EDF3', display: 'grid', gap: 1.5, justifyItems: 'start' }}>
        <Typography variant="h4" component="h2" sx={{ display: 'flex', gap: 1, alignItems: 'center', color: '#FFFFFF' }}><Trophy size={20} aria-hidden="true" />{t('Your streak starts with a challenge')}</Typography>
        <Typography sx={{ color: '#8B949E' }}>{t('Join a challenge and mark attendance each day. Your streak, activity and graph will show up here.')}</Typography>
        <Button component={RouterLink} to={ROUTES.appChallenges} variant="contained" size="small">{t('Browse challenges')}</Button>
        {children}
      </Box>
    )
  }

  const today = data.today
  const firstYear = Number(data.first_enrolled.slice(0, 4))
  const thisYear = Number(today.slice(0, 4))
  const years = Array.from({ length: thisYear - firstYear + 1 }, (_, i) => thisYear - i)
  const monthStart = `${data.first_enrolled.slice(0, 7)}-01`
  const floor = addDaysIso(today, -364)
  let start = monthStart < floor ? floor : monthStart
  let end = today
  if (year !== 'current') {
    start = `${year}-01-01`
    end = `${year}-12-31` > today ? today : `${year}-12-31`
  }
  const heading = year === 'current' ? t('{count} active days since you joined', { count: data.activity.filter((a) => a.date >= start && a.date <= end).length }) : t('{count} active days in {year}', { count: data.activity.filter((a) => a.date >= start && a.date <= end).length, year })
  const subtitle = `${formatDate(start, lang)} → ${formatDate(end, lang)} · ${t('weekly')}`

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, borderRadius: '20px', bgcolor: '#010409', color: '#E6EDF3', display: 'grid', gap: 2.5, boxShadow: '0 12px 30px rgba(1, 4, 9, 0.35)' }}>
      <StreakStats data={data} />
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
          <Typography sx={{ fontWeight: 700, color: '#FFFFFF' }}>{heading}</Typography>
          <NativeSelect value={year} onChange={(e) => setYear(e.target.value)} inputProps={{ 'aria-label': t('Choose a year') }} sx={{ color: '#E6EDF3', bgcolor: '#161B22', borderRadius: '8px', px: 1.5, fontSize: '0.875rem', '&:before, &:after': { display: 'none' }, '& select': { py: 0.75, pr: '28px !important' }, '& svg': { color: '#8B949E' } }}>
            <option value="current">{t('Current')}</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </NativeSelect>
        </Box>
        <ActivityGrid key={`${start}-${end}`} activity={data.activity} start={start} end={end} />
      </Box>
      <ChallengeGraph activity={data.activity} start={start} end={end} title={subtitle} />
      {children}
    </Box>
  )
}
