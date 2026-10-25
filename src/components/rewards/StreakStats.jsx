import { Box, Typography } from '@mui/material'
import { Flame } from 'lucide-react'
import { useI18n } from '../../hooks/useI18n.js'
import { formatDate } from '../../utils/appDates.js'

const GREEN = '#39D353'
const range = (r, lang, t) => (r?.start && r?.end ? `${formatDate(r.start, lang)} – ${formatDate(r.end, lang)}` : t('No streak yet'))

function Cell({ children, label, sub, accent }) {
  return (
    <Box sx={{ display: 'grid', justifyItems: 'center', alignContent: 'center', gap: 0.5, px: 1, py: 2, textAlign: 'center', minWidth: 0 }}>
      {children}
      <Typography sx={{ color: accent ?? '#E6EDF3', fontWeight: 600 }}>{label}</Typography>
      <Typography variant="body2" sx={{ color: '#8B949E' }}>{sub}</Typography>
    </Box>
  )
}

// The three figures: total active days, the current streak (in a ring) and the longest streak, each with its dates.
export default function StreakStats({ data }) {
  const { t, lang } = useI18n()
  const big = { color: '#FFFFFF', fontWeight: 800, fontSize: { xs: '1.75rem', sm: '2.1rem' }, lineHeight: 1.1 }
  const since = data.first_active ? `${formatDate(data.first_active, lang)} – ${t('Present')}` : t('No streak yet')
  const full = data.current_streak > 0
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', border: '1px solid #1E6B34', borderRadius: '14px', bgcolor: '#0D1117', '& > * + *': { borderLeft: '1px solid #1E6B34' } }}>
      <Cell label={t('Total active days')} sub={since}>
        <Typography sx={big}>{data.total_active_days}</Typography>
      </Cell>
      <Cell label={t('Current streak')} sub={range(data.current_streak_range, lang, t)} accent={GREEN}>
        <Box sx={{ position: 'relative', width: 88, height: 88, display: 'grid', placeItems: 'center' }}>
          <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
            <circle cx="44" cy="44" r="38" fill="none" stroke="#1E2A22" strokeWidth="5" />
            <circle cx="44" cy="44" r="38" fill="none" stroke={full ? GREEN : '#1E2A22'} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 38 * 0.92} ${2 * Math.PI * 38}`} transform="rotate(-80 44 44)" />
          </svg>
          <Box sx={{ position: 'absolute', top: -4, left: '50%', transform: 'translateX(-50%)', bgcolor: '#0D1117', px: 0.25, color: full ? GREEN : '#8B949E' }}><Flame size={20} aria-hidden="true" /></Box>
          <Typography sx={{ ...big, fontSize: '1.9rem' }}>{data.current_streak}</Typography>
        </Box>
      </Cell>
      <Cell label={t('Longest streak')} sub={range(data.best_streak_range, lang, t)}>
        <Typography sx={big}>{data.best_streak}</Typography>
      </Cell>
    </Box>
  )
}
