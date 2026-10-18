import { Box, Typography } from '@mui/material'
import { colors, radii, shadows } from '../../theme/tokens.js'

// Headline numbers: one value per tile, with a short note under it.
export default function StatTiles({ stats }) {
  return (
    <Box component="dl" sx={{ m: 0, display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: `repeat(${stats.length}, 1fr)` } }}>
      {stats.map((s) => (
        <Box key={s.label} sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: `${radii.md}px`, boxShadow: shadows.sm, p: { xs: 2, md: 2.5 }, display: 'flex', flexDirection: 'column' }}>
          <Typography component="dt" variant="body2" sx={{ color: colors.textSecondary, fontWeight: 600, order: 1 }}>
            {s.label}
          </Typography>
          <Typography component="dd" sx={{ m: 0, order: 0, fontSize: { xs: '1.75rem', md: '2.125rem' }, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1, mb: 0.5 }}>
            {s.value}
          </Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0, order: 2, color: colors.textMuted, mt: 0.5 }}>
            {s.note}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}
