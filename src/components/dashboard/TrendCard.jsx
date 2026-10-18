import { Box, Typography } from '@mui/material'
import ChartCard from '../charts/ChartCard.jsx'
import LineChart from '../charts/LineChart.jsx'
import Reveal from '../ui/Reveal.jsx'
import { useI18n } from '../../hooks/useI18n.js'
import { toLocalDate } from '../../utils/dashboard.js'
import { chart } from '../../theme/tokens.js'

// How the weekly average completion has moved over the last weeks (only weeks with enough planned days have one).
export default function TrendCard({ points }) {
  const { t, lang } = useI18n()
  const short = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' })
  const labels = points.map((p) => short.format(toLocalDate(p.weekStart)))
  const first = points[0]?.value
  const last = points[points.length - 1]?.value
  return (
    <Reveal sx={{ minWidth: 0 }} delay={80}>
      <ChartCard title="Weekly consistency" subtitle="Average completion by week, rest days not counted" badge={null}>
        {points.length >= 2 ? (
          <LineChart
            ariaLabel={t('Line chart of your weekly average completion, from {first}% to {last}% over {count} weeks.', { first, last, count: points.length })}
            labels={labels}
            yMin={0}
            yMax={100}
            yStep={25}
            format={(v) => `${v}%`}
            area
            series={[{ key: 'average', label: t('Average completion'), color: chart.series1, values: points.map((p) => p.value) }]}
          />
        ) : (
          <Box sx={{ py: 4 }}>
            <Typography color="text.secondary">{t('Your trend appears once two weeks have enough planned days (at least 3 each).')}</Typography>
          </Box>
        )}
      </ChartCard>
    </Reveal>
  )
}
