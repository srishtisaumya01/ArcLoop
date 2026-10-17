import { Box, LinearProgress, Typography } from '@mui/material'
import { colors, radii } from '../../theme/tokens.js'
import { describeDay, formatDay, weekdayShort, weekdayName } from './weekFormat.js'

// One day of the week. A button, so keyboard and screen-reader users can select it; the state is
// always written out in words.
export default function DayCard({ entry, isToday, selected, onSelect }) {
  const { label, detail, showProgress } = describeDay(entry, { isToday })
  return (
    <Box
      component="button"
      type="button"
      onClick={() => onSelect(entry.date)}
      aria-pressed={selected}
      aria-label={`${weekdayName(entry.date)} ${formatDay(entry.date)}${isToday ? ', today' : ''}: ${label}. ${detail}`}
      sx={{
        position: 'relative', font: 'inherit', textAlign: 'left', cursor: 'pointer', p: 1.5, minHeight: 120,
        borderRadius: `${radii.md}px`, bgcolor: selected ? colors.bgAlt : colors.surface,
        border: `2px solid ${selected ? colors.blue600 : colors.border}`,
        display: 'flex', flexDirection: 'column', gap: 0.5,
        '&:focus-visible': { outline: `3px solid ${colors.blue600}`, outlineOffset: 2 },
      }}
    >
      <Typography variant="overline" component="span" sx={{ color: isToday ? colors.blue600 : 'text.secondary' }} aria-hidden="true">
        {weekdayShort(entry.date)} {formatDay(entry.date)}
      </Typography>
      {/* A badge on the card's edge, so marking today never makes the date line wrap and misalign the card. */}
      {isToday && (
        <Box component="span" aria-hidden="true" sx={{ position: 'absolute', top: -11, right: 10, px: 1, py: '1px', borderRadius: '10px', bgcolor: colors.navy900, color: '#fff', fontSize: '0.6875rem', fontWeight: 700, lineHeight: 1.6 }}>
          Today
        </Box>
      )}
      <Typography component="span" sx={{ fontWeight: 600 }} aria-hidden="true">{label}</Typography>
      <Typography component="span" variant="body2" color="text.secondary" aria-hidden="true">{detail}</Typography>
      {showProgress && (
        <Box sx={{ mt: 'auto' }} aria-hidden="true">
          <LinearProgress variant="determinate" value={entry.percent ?? 0} sx={{ height: 6, borderRadius: 3 }} />
          <Typography variant="caption" color="text.secondary">{entry.percent ?? 0}%</Typography>
        </Box>
      )}
    </Box>
  )
}
