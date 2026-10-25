import { Box, Typography } from '@mui/material'
import { useI18n } from '../../hooks/useI18n.js'
import { addDaysIso } from '../../utils/appDates.js'
import { chart, colors } from '../../theme/tokens.js'

const LEVELS = [chart.grid, '#9BE9A8', '#40C463', '#30A14E', '#216E39']
const level = (n) => (n <= 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n === 3 ? 3 : 4)

// A year of days as small squares, like a contribution graph: the more challenges marked on a day, the deeper the green.
export default function ActivityGrid({ activity, today }) {
  const { t, lang } = useI18n()
  const counts = new Map(activity.map((a) => [a.date, a.count]))
  const weekday = (iso) => new Date(`${iso}T12:00:00`).getDay() // Sunday first
  const first = addDaysIso(today, -364 - weekday(addDaysIso(today, -364))) // back up to a Sunday
  const weeks = []
  for (let d = first; d <= today; d = addDaysIso(d, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDaysIso(d, i)).map((x) => (x <= today ? x : null)))
  }
  const monthLabel = (iso) => new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-GB', { month: 'short' }).format(new Date(`${iso}T12:00:00`))
  const dateLabel = (iso) => new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${iso}T12:00:00`))
  let lastMonth = ''
  return (
    <Box sx={{ overflowX: 'auto', pb: 1 }}>
      <Box role="img" aria-label={t('Your activity over the past year')} sx={{ display: 'inline-grid', gridAutoFlow: 'column', gridAutoColumns: '14px', gap: '4px', minWidth: 'max-content' }}>
        {weeks.map((week, wi) => {
          const m = monthLabel(week.find(Boolean) ?? today)
          const showMonth = m !== lastMonth
          lastMonth = m
          return (
            <Box key={wi} sx={{ display: 'grid', gridTemplateRows: 'auto repeat(7, 14px)', gap: '4px' }}>
              <Typography component="span" sx={{ fontSize: '0.7rem', height: 14, lineHeight: '14px', color: colors.textMuted, whiteSpace: 'nowrap', overflow: 'visible' }}>{showMonth ? m : ''}</Typography>
              {week.map((day, di) => (
                <Box key={di} title={day ? `${dateLabel(day)}: ${counts.get(day) ? t('{count} marked', { count: counts.get(day) }) : t('nothing marked')}` : undefined}
                  sx={{ width: 14, height: 14, borderRadius: '3px', bgcolor: day ? LEVELS[level(counts.get(day) ?? 0)] : 'transparent' }} />
              ))}
            </Box>
          )
        })}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, justifyContent: 'flex-end', mt: 1 }}>
        <Typography variant="caption" color="text.secondary">{t('Less')}</Typography>
        {LEVELS.map((c, i) => <Box key={i} aria-hidden="true" sx={{ width: 12, height: 12, borderRadius: '3px', bgcolor: c }} />)}
        <Typography variant="caption" color="text.secondary">{t('More')}</Typography>
      </Box>
    </Box>
  )
}
