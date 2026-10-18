import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Chip, Typography } from '@mui/material'
import { CalendarDays, Check } from 'lucide-react'
import { challengePath } from '../../constants/navigation.js'
import { colors, gradients, onBrandButtons, radii, shadows } from '../../theme/tokens.js'

// Featured campaign panel. Entirely data-driven from the challenge record, so
// any campaign (not only Winter Arc 90) can be featured.
export default function FeaturedChallengeCard({ challenge, ctaLabel = 'See challenge details' }) {
  return (
    <Box
      component="article"
      aria-labelledby="featured-challenge-title"
      sx={{
        borderRadius: `${radii.lg}px`,
        background: gradients.brand,
        color: colors.textOnDark,
        p: { xs: 3, md: 6 },
        display: 'grid',
        gap: { xs: 4, md: 6 },
        gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr' },
        boxShadow: shadows.lg,
      }}
    >
      <Box>
        <Chip label="Featured campaign" size="small" sx={{ bgcolor: colors.mint300, color: colors.navy900, mb: 2.5 }} />
        <Typography variant="h2" component="h3" id="featured-challenge-title" sx={{ mb: 2 }}>
          {challenge.title}
        </Typography>
        <Typography variant="subtitle1" sx={{ color: 'rgba(255, 255, 255, 0.86)', mb: 3 }}>
          {challenge.summary}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: colors.mint300, mb: 3 }}>
          <CalendarDays size={18} aria-hidden="true" />
          <Typography sx={{ color: 'inherit', fontWeight: 700 }}>
            {challenge.durationLabel} · {challenge.scheduleLabel.toLowerCase()}
          </Typography>
        </Box>
        <Button component={RouterLink} to={challengePath(challenge.slug)} variant="contained" size="large" sx={onBrandButtons.solid}>
          {ctaLabel}
        </Button>
      </Box>
      <Box sx={{ p: { xs: 2.5, md: 3 }, borderRadius: `${radii.md}px`, bgcolor: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.2)', alignSelf: 'start' }}>
        <Typography variant="overline" component="h4" sx={{ color: colors.mint300, display: 'block', mb: 2 }}>
          How it works
        </Typography>
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 2 }}>
          {challenge.rules.map((r) => (
            <Box component="li" key={r} sx={{ display: 'flex', gap: 1.5 }}>
              <Box sx={{ color: colors.mint300, mt: '3px', flexShrink: 0 }}>
                <Check size={20} aria-hidden="true" />
              </Box>
              <Typography sx={{ color: 'rgba(255, 255, 255, 0.86)' }}>{r}</Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  )
}
