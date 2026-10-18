import { Box, Typography } from '@mui/material'
import CountUp from '../ui/CountUp.jsx'
import Reveal from '../ui/Reveal.jsx'
import { colors, gradients, radii, shadows } from '../../theme/tokens.js'

// A row of headline numbers. Each tile: { key, icon, label, value (number or null), suffix, note }.
export default function KpiTiles({ tiles }) {
  return (
    <Box component="dl" sx={{ m: 0, display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: `repeat(${tiles.length}, minmax(0, 1fr))` } }}>
      {tiles.map(({ key, icon: Icon, label, value, suffix, note }, i) => (
        <Reveal key={key} delay={i * 90} sx={{ display: 'flex' }}>
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              p: { xs: 2, md: 2.5 },
              borderRadius: `${radii.md}px`,
              bgcolor: colors.surface,
              border: `1px solid ${colors.border}`,
              boxShadow: shadows.sm,
              display: 'flex',
              flexDirection: 'column',
              transition: 'transform 240ms cubic-bezier(0.2, 0.7, 0.2, 1), box-shadow 240ms',
              '&:hover': { transform: 'translateY(-3px)', boxShadow: shadows.md },
            }}
          >
            <Box sx={{ width: 40, height: 40, mb: 1.5, borderRadius: '12px', display: 'grid', placeItems: 'center', background: gradients.brand, color: colors.textOnDark }}>
              <Icon size={20} aria-hidden="true" />
            </Box>
            <Typography component="dt" variant="body2" sx={{ color: colors.textSecondary, fontWeight: 600, order: 1 }}>
              {label}
            </Typography>
            <Typography component="dd" sx={{ m: 0, order: 0, fontSize: { xs: '1.75rem', md: '2.125rem' }, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1, mb: 0.5, fontVariantNumeric: 'tabular-nums' }}>
              {value === null ? '–' : <CountUp value={value} suffix={suffix} />}
            </Typography>
            <Typography component="dd" variant="body2" sx={{ m: 0, order: 2, color: colors.textMuted, mt: 0.5 }}>
              {note}
            </Typography>
          </Box>
        </Reveal>
      ))}
    </Box>
  )
}
