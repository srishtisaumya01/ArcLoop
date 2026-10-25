import { Box, Typography } from '@mui/material'
import { useI18n } from '../../hooks/useI18n.js'
import { addDaysIso } from '../../utils/appDates.js'
import { chart, colors } from '../../theme/tokens.js'

const LEVELS = [chart.grid, '#9BE9A8', '#40C463', '#30A14E', '#216E39']
const level = (n) => (n <= 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n === 3 ? 3 : 4)

// A year of days as small squares, like GitHub's contribution graph: the more challenges marked on a day, the deeper the green.
// The squares share the width they are given (and scroll sideways on a very narrow screen).
export default function ActivityGrid({ activity, today }) {
  const { t, lang } = useI18n()
  const counts = new Map(activity.map((a) => [a.date, a.count]))
  const weekday = (iso) => new Date(`${iso}T12:00:00`).getDay() // Sunday first
  const first = addDaysIso(today, -364 - weekday(addDaysIso(today, -364))) // back up to a Sunday
  const weeks = []
  for (let d = first; d <= today; d = addDaysIso(d, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDaysIso(d, i)).map((x) => (x <= today ? x : null)))
  }
  const locale = lang === 'hi' ? 'hi-IN' : 'en-GB'
  const monthLabel = (iso) => new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(`${iso}T12:00:00`))
  const dateLabel = (iso) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${iso}T12:00:00`))
  const dayName = (i) => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2026, 0, 4 + i, 12)) // 4 Jan 2026 is a Sunday
  let lastMonth = ''
  const GAP = '3px'
  return (
    <Box sx={{ overflowX: 'auto', pb: 0.5 }}>
      <Box sx={{ minWidth: 560, display: 'grid', gridTemplateColumns: `28px repeat(${weeks.length}, minmax(0, 17px))`, justifyContent: 'start', gap: GAP }} role="img" aria-label={t('Your activity over the past year')}>
        <Box sx={{ display: 'grid', gridTemplateRows: `14px repeat(7, 1fr)`, gap: GAP }}>
          <span />
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <Typography key={i} component="span" sx={{ fontSize: '0.65rem', lineHeight: 1, color: colors.textMuted, display: 'flex', alignItems: 'center' }}>{i % 2 === 1 ? dayName(i) : ''}</Typography>
          ))}
        </Box>
        {weeks.map((week, wi) => {
          const m = monthLabel(week.find(Boolean) ?? today)
          const showMonth = m !== lastMonth
          lastMonth = m
          return (
            <Box key={wi} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gridTemplateRows: `14px repeat(7, auto)`, gap: GAP, minWidth: 0 }}>
              <Typography component="span" sx={{ fontSize: '0.65rem', lineHeight: '14px', color: colors.textMuted, whiteSpace: 'nowrap', overflow: 'visible' }}>{showMonth ? m : ''}</Typography>
              {week.map((day, di) => (
                <Box key={di} title={day ? `${dateLabel(day)}: ${counts.get(day) ? t('{count} marked', { count: counts.get(day) }) : t('nothing marked')}` : undefined}
                  sx={{ aspectRatio: '1', borderRadius: '2px', bgcolor: day ? LEVELS[level(counts.get(day) ?? 0)] : 'transparent' }} />
              ))}
            </Box>
          )
        })}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end', mt: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>{t('Less')}</Typography>
        {LEVELS.map((c, i) => <Box key={i} aria-hidden="true" sx={{ width: 11, height: 11, borderRadius: '2px', bgcolor: c }} />)}
        <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>{t('More')}</Typography>
      </Box>
    </Box>
  )
}
