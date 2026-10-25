import { Box, Typography } from '@mui/material'
import { useI18n } from '../../hooks/useI18n.js'
import { addDaysIso } from '../../utils/appDates.js'
import { useStreakTheme } from './streakTheme.js'

const level = (n) => (n <= 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n === 3 ? 3 : 4)

// Days from `start` to `end` as small squares, like GitHub's contribution graph (on a dark panel): the more challenges marked on a
// day, the brighter the green. The squares share the width they are given (and scroll sideways on a very narrow screen).
export default function ActivityGrid({ activity, start, end, today }) {
  const { t, lang } = useI18n()
  const p = useStreakTheme()
  const counts = new Map(activity.map((a) => [a.date, a.count]))
  const weekday = (iso) => new Date(`${iso}T12:00:00`).getDay() // Sunday first
  const first = addDaysIso(start, -weekday(start)) // back up to a Sunday
  const weeks = []
  for (let d = first; d <= end; d = addDaysIso(d, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDaysIso(d, i)).map((x) => (x >= start && x <= end ? x : null)))
  }
  const locale = lang === 'hi' ? 'hi-IN' : 'en-GB'
  const monthLabel = (iso) => new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(`${iso}T12:00:00`))
  const dateLabel = (iso) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${iso}T12:00:00`))
  const dayName = (i) => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2026, 0, 4 + i, 12)) // 4 Jan 2026 is a Sunday
  let lastMonth = ''
  const GAP = '3px'
  return (
    <Box sx={{ overflowX: 'auto', pb: 0.5 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: `28px repeat(${weeks.length}, minmax(0, 1fr))`, gap: GAP, minWidth: weeks.length > 20 ? 640 : 0 }} role="img" aria-label={t('Your activity')}>
        <Box sx={{ display: 'grid', gridTemplateRows: `14px repeat(7, 1fr)`, gap: GAP }}>
          <span />
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <Typography key={i} component="span" sx={{ fontSize: '0.65rem', lineHeight: 1, color: p.muted, display: 'flex', alignItems: 'center' }}>{i % 2 === 1 ? dayName(i) : ''}</Typography>
          ))}
        </Box>
        {weeks.map((week, wi) => {
          const m = monthLabel(week.find(Boolean) ?? start)
          const showMonth = m !== lastMonth
          lastMonth = m
          return (
            <Box key={wi} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gridTemplateRows: `14px repeat(7, auto)`, gap: GAP, minWidth: 0 }}>
              <Typography component="span" sx={{ fontSize: '0.65rem', lineHeight: '14px', color: p.muted, whiteSpace: 'nowrap', overflow: 'visible' }}>{showMonth ? m : ''}</Typography>
              {week.map((day, di) => (
                <Box key={di} title={day ? `${dateLabel(day)}: ${counts.get(day) ? t('{count} marked', { count: counts.get(day) }) : t('nothing marked')}` : undefined}
                  sx={{ aspectRatio: '1', borderRadius: '3px', opacity: day && day > today ? 0.45 : 1, bgcolor: day ? p.cells[level(counts.get(day) ?? 0)] : 'transparent', outline: day ? '1px solid rgba(128,128,128,0.08)' : 'none', outlineOffset: '-1px' }} />
              ))}
            </Box>
          )
        })}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-start', ml: '31px', mt: 1 }}>
        <Typography variant="caption" sx={{ color: p.muted, mr: 0.5 }}>{t('Less')}</Typography>
        {p.cells.map((c, i) => <Box key={i} aria-hidden="true" sx={{ width: 11, height: 11, borderRadius: '2px', bgcolor: c }} />)}
        <Typography variant="caption" sx={{ color: p.muted, ml: 0.5 }}>{t('More')}</Typography>
      </Box>
    </Box>
  )
}
