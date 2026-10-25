import { useState } from 'react'
import { Box, NativeSelect, Typography } from '@mui/material'
import ActivityGrid from './ActivityGrid.jsx'
import ChallengeGraph from './ChallengeGraph.jsx'
import StreakStats from './StreakStats.jsx'
import { useI18n } from '../../hooks/useI18n.js'
import { addMonthsIso, endOfMonthIso, formatDate } from '../../utils/appDates.js'

const card = { p: { xs: 2, md: 2.5 }, borderRadius: '16px', bgcolor: '#0D1117', border: '1px solid #1E6B34', color: '#E6EDF3', boxShadow: '0 8px 24px rgba(1, 4, 9, 0.25)' }

// Three separate black cards: the streak figures, the activity grid (six months from the month of the first challenge, or a whole
// year chosen in the filter) and the weekly challenge graph. Before the first challenge there is nothing to show.
export default function StreakPanel({ data, children }) {
  const { t, lang } = useI18n()
  const [year, setYear] = useState('current')

  if (!data.has_enrollment) return null

  const today = data.today
  const firstYear = Number(data.first_enrolled.slice(0, 4))
  const thisYear = Number(today.slice(0, 4))
  const years = Array.from({ length: thisYear - firstYear + 1 }, (_, i) => thisYear - i)

  let gridStart = `${data.first_enrolled.slice(0, 7)}-01`
  let gridEnd = endOfMonthIso(addMonthsIso(gridStart, 5)) // six months, starting with the month the first challenge was joined
  if (today > gridEnd) {
    gridEnd = endOfMonthIso(today) // after that, the latest six months
    gridStart = addMonthsIso(gridEnd, -5)
  }
  if (year !== 'current') {
    gridStart = `${year}-01-01`
    gridEnd = `${year}-12-31`
  }
  const graphEnd = gridEnd > today ? today : gridEnd
  const subtitle = `${formatDate(gridStart, lang)} → ${formatDate(graphEnd, lang)} · ${t('weekly')}`

  return (
    <Box sx={{ display: 'grid', gap: 2.5 }}>
      <StreakStats data={data} />
      <Box sx={card}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
          <Typography sx={{ fontWeight: 700, color: '#FFFFFF' }}>{t('Streak')}</Typography>
          <NativeSelect
            value={year}
            onChange={(e) => setYear(e.target.value)}
            inputProps={{ 'aria-label': t('Choose a period') }}
            sx={{ color: '#F0F6FC', bgcolor: '#21262D', border: '1px solid #3D444D', borderRadius: '8px', px: 1.5, fontSize: '0.9rem', fontWeight: 600, colorScheme: 'dark', '&:before, &:after': { display: 'none' }, '& select': { py: 0.75, pr: '30px !important', color: '#F0F6FC' }, '& select option': { bgcolor: '#161B22', color: '#F0F6FC' }, '& svg': { color: '#C9D1D9' } }}
          >
            <option value="current">{t('Last 6 months')}</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </NativeSelect>
        </Box>
        <ActivityGrid key={`${gridStart}-${gridEnd}`} activity={data.activity} start={gridStart} end={gridEnd} today={today} />
      </Box>
      <ChallengeGraph activity={data.activity} start={gridStart} end={graphEnd} title={subtitle} />
      {children}
    </Box>
  )
}
