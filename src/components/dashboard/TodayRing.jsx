import { Box, Typography } from '@mui/material'
import { useInView } from '../../hooks/useInView.js'
import { useI18n } from '../../hooks/useI18n.js'
import { colors } from '../../theme/tokens.js'

// A ring that fills to today's progress. It draws in once it is on screen.
export default function TodayRing({ percent, label, size = 148 }) {
  const { t } = useI18n()
  const [ref, drawn] = useInView({ threshold: 0.2 })
  const stroke = 12
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const value = Math.max(0, Math.min(100, percent))
  return (
    <Box ref={ref} role="img" aria-label={t('{percent}% of today’s plan', { percent: value })} sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255, 255, 255, 0.22)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colors.mint300}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{ strokeDashoffset: drawn ? circumference * (1 - value / 100) : circumference, transition: 'stroke-dashoffset 1300ms cubic-bezier(0.2, 0.7, 0.2, 1)' }}
        />
      </svg>
      <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <Box>
          <Typography component="div" sx={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {value}%
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.85)', mt: 0.5 }}>
            {label}
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}
