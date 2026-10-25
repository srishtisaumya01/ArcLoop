import { Box, Typography } from '@mui/material'
import { Flame } from 'lucide-react'
import CountUp from '../ui/CountUp.jsx'
import { useInView } from '../../hooks/useInView.js'
import { useI18n } from '../../hooks/useI18n.js'
import { formatDate } from '../../utils/appDates.js'
import { useStreakTheme } from './streakTheme.js'

const range = (r, lang, t) => (r?.start && r?.end ? `${formatDate(r.start, lang)} – ${formatDate(r.end, lang)}` : t('No streak yet'))

function Cell({ children, label, sub, accent, p }) {
  return (
    <Box sx={{ display: 'grid', justifyItems: 'center', alignContent: 'center', gap: 0.5, px: 1, py: 2, textAlign: 'center', minWidth: 0 }}>
      {children}
      <Typography sx={{ color: accent ?? p.text, fontWeight: 600 }}>{label}</Typography>
      <Typography variant="body2" sx={{ color: p.muted }}>{sub}</Typography>
    </Box>
  )
}

// The three figures: total active days, the current streak (in a ring) and the longest streak, each with its dates.
export default function StreakStats({ data }) {
  const { t, lang } = useI18n()
  const p = useStreakTheme()
  const [ref, inView] = useInView({ threshold: 0.3 })
  const GREEN = p.streakGreen // the streak is green while it is running
  const big = { color: p.strong, fontWeight: 800, fontSize: { xs: '1.75rem', sm: '2.1rem' }, lineHeight: 1.1 }
  const since = data.first_active ? `${formatDate(data.first_active, lang)} – ${t('Present')}` : t('No streak yet')
  const full = data.current_streak > 0
  return (
    <Box ref={ref} sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', ...p.bar, border: `1px solid ${p.border}`, borderRadius: '16px', background: p.card, boxShadow: p.shadow, '& > * + *': { borderLeft: `1px solid ${p.border}` } }}>
      <Cell p={p} label={t('Total active days')} sub={since}>
        <Typography sx={big}><CountUp value={data.total_active_days} duration={1200} /></Typography>
      </Cell>
      <Cell p={p} label={t('Current streak')} sub={range(data.current_streak_range, lang, t)} accent={data.current_streak > 0 ? GREEN : undefined}>
        <Box sx={{ position: 'relative', width: 88, height: 88, display: 'grid', placeItems: 'center' }}>
          <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
            <circle cx="44" cy="44" r="38" fill="none" stroke={p.ringTrack} strokeWidth="5" />
            <circle cx="44" cy="44" r="38" fill="none" stroke={full ? GREEN : p.ringTrack} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 38 * 0.92} ${2 * Math.PI * 38}`} strokeDashoffset={inView ? 0 : 2 * Math.PI * 38 * 0.92} transform="rotate(-80 44 44)" style={{ transition: 'stroke-dashoffset 1400ms cubic-bezier(0.4, 0, 0.2, 1)' }} />
          </svg>
          <Box sx={{ position: 'absolute', top: -4, left: '50%', transform: 'translateX(-50%)', bgcolor: p.solid, px: 0.25, color: full ? GREEN : p.muted }}><Flame size={20} aria-hidden="true" /></Box>
          <Typography sx={{ ...big, fontSize: '1.9rem' }}><CountUp value={data.current_streak} duration={1200} /></Typography>
        </Box>
      </Cell>
      <Cell p={p} label={t('Longest streak')} sub={range(data.best_streak_range, lang, t)}>
        <Typography sx={big}><CountUp value={data.best_streak} duration={1200} /></Typography>
      </Cell>
    </Box>
  )
}
