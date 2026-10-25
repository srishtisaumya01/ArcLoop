import { Box, Typography } from '@mui/material'
import { useId } from 'react'
import { useI18n } from '../../hooks/useI18n.js'
import { addDaysIso, formatDate } from '../../utils/appDates.js'
import { useStreakTheme } from './streakTheme.js'

const W = 900
const H = 280
const PAD = { l: 44, r: 24, t: 34, b: 38 }

const niceMax = (v) => {
  if (v <= 4) return 4
  const step = Math.pow(10, Math.floor(Math.log10(v / 4)))
  const unit = [1, 2, 2.5, 5, 10].find((u) => u * step * 4 >= v)
  return unit * step * 4
}

// "Challenge graph": the number of challenges marked each week, from `start` to `end`, as a green line over a dark panel.
export default function ChallengeGraph({ activity, start, end, title }) {
  const { t, lang } = useI18n()
  const p = useStreakTheme()
  const GREEN = p.line
  const id = useId().replace(/:/g, '')
  const weekday = (iso) => new Date(`${iso}T12:00:00`).getDay()
  const first = addDaysIso(start, -weekday(start))
  const weeks = []
  const counts = new Map(activity.map((a) => [a.date, a.count]))
  for (let d = first; d <= end; d = addDaysIso(d, 7)) {
    let total = 0
    for (let i = 0; i < 7; i++) {
      const day = addDaysIso(d, i)
      if (day >= start && day <= end) total += counts.get(day) ?? 0
    }
    weeks.push({ start: d, total })
  }
  const max = niceMax(Math.max(0, ...weeks.map((w) => w.total)))
  const n = weeks.length
  const x = (i) => PAD.l + (n === 1 ? (W - PAD.l - PAD.r) / 2 : (i * (W - PAD.l - PAD.r)) / (n - 1))
  const y = (v) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b)
  const line = weeks.map((w, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(w.total).toFixed(1)}`).join(' ')
  const area = `${line} L${x(n - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`
  const locale = lang === 'hi' ? 'hi-IN' : 'en-GB'
  const month = (iso) => new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(`${iso}T12:00:00`))
  const ticks = [0, 1, 2, 3, 4].map((k) => (max * k) / 4)
  const peak = weeks.reduce((best, w, i) => (w.total > (weeks[best]?.total ?? -1) ? i : best), 0)
  const total = weeks.reduce((s, w) => s + w.total, 0)
  let lastMonth = ''
  return (
    <Box sx={{ border: `1px solid ${p.border}`, borderRadius: '16px', background: p.card, boxShadow: p.shadow, p: { xs: 1.5, sm: 2 } }}>
      <Typography sx={{ color: GREEN, fontWeight: 800, textAlign: 'center' }}>{t('Challenge graph')}</Typography>
      <Typography variant="body2" sx={{ color: p.muted, textAlign: 'center', mb: 0.5 }}>{title}</Typography>
      <Box component="svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('Challenges marked each week')} sx={{ width: 1, height: 'auto', display: 'block' }}>
        <defs>
          <linearGradient id={`${id}a`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={GREEN} stopOpacity="0.35" /><stop offset="1" stopColor={GREEN} stopOpacity="0" /></linearGradient>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke={p.gridLines} strokeDasharray="3 4" />
            <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" fontSize="12" fill={GREEN} fontFamily="Arial, Helvetica, sans-serif">{Number.isInteger(v) ? v : v.toFixed(1)}</text>
          </g>
        ))}
        <path d={area} fill={`url(#${id}a)`} />
        <path d={line} fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {weeks.map((w, i) => {
          const m = month(w.start < start ? start : w.start) // a week that began before the range is named for its first day inside it
          const show = m !== lastMonth
          lastMonth = m
          return (
            <g key={w.start}>
              <circle cx={x(i)} cy={y(w.total)} r="3.5" fill={p.dot} stroke={GREEN} strokeWidth="1.5"><title>{`${formatDate(w.start, lang)}: ${w.total}`}</title></circle>
              {show && <text x={x(i)} y={H - 12} textAnchor="middle" fontSize="12" fontWeight="700" fill={GREEN} fontFamily="Arial, Helvetica, sans-serif">{m}</text>}
            </g>
          )
        })}
        {weeks[peak]?.total > 0 && <text x={x(peak)} y={y(weeks[peak].total) - 10} textAnchor="middle" fontSize="13" fontWeight="800" fill={p.strong} fontFamily="Arial, Helvetica, sans-serif">{weeks[peak].total}</text>}
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 1 }}>
        <Typography variant="caption" sx={{ color: p.muted }}>{t('Weekly marks')}</Typography>
        <Typography variant="caption" sx={{ color: GREEN, fontWeight: 700 }}>{t('{count} marks in total', { count: total })}</Typography>
      </Box>
    </Box>
  )
}
