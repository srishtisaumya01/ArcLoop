import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Typography } from '@mui/material'
import { ArrowRight, Flame } from 'lucide-react'
import Reveal from '../ui/Reveal.jsx'
import { useChallengeClock } from '../../hooks/useChallengeClock.js'
import { useI18n } from '../../hooks/useI18n.js'
import { challengePath } from '../../constants/navigation.js'
import { colors, gradients, onBrandButtons, radii, shadows } from '../../theme/tokens.js'

// Where the featured challenge stands today: day number, how far through it is, and what is left.
export default function ChallengeCard() {
  const { t } = useI18n()
  const live = useChallengeClock()
  if (!live || live.clock.status === 'ended') return null
  const { challenge, clock } = live
  return (
    <Reveal delay={60}>
      <Box sx={{ p: { xs: 2.5, md: 3 }, borderRadius: `${radii.lg}px`, background: gradients.brand, color: colors.textOnDark, boxShadow: shadows.md }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: colors.mint300, fontWeight: 700, mb: 1 }}>
          <Flame size={18} aria-hidden="true" />
          {t(challenge.title)}
        </Box>
        <Typography component="p" sx={{ fontSize: '1.75rem', fontWeight: 800, lineHeight: 1.15 }}>
          {clock.status === 'live' ? t('Day {day} of {total}', { day: clock.dayNumber, total: clock.totalDays }) : t('Starts soon')}
        </Typography>
        <Box aria-hidden="true" sx={{ mt: 1.5, height: 8, borderRadius: 4, bgcolor: 'rgba(255, 255, 255, 0.22)', overflow: 'hidden' }}>
          <Box sx={{ width: `${Math.round(clock.progress * 100)}%`, height: '100%', borderRadius: 4, background: gradients.accentText }} />
        </Box>
        <Typography sx={{ mt: 1, mb: 2, color: 'rgba(255, 255, 255, 0.9)' }}>
          {clock.daysLeft === 0 ? t('Last day today') : t('{count} days left', { count: clock.daysLeft })}
        </Typography>
        <Button component={RouterLink} to={challengePath(challenge.slug)} variant="contained" size="small" endIcon={<ArrowRight size={16} aria-hidden="true" />} sx={onBrandButtons.solid}>
          {t('View challenge')}
        </Button>
      </Box>
    </Reveal>
  )
}
