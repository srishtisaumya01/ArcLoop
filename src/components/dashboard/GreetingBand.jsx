import { Box, Container, Typography } from '@mui/material'
import { CalendarDays } from 'lucide-react'
import TodayRing from './TodayRing.jsx'
import { useI18n } from '../../hooks/useI18n.js'
import { enter } from '../../theme/animations.js'
import { colors, contentWidths, gradients } from '../../theme/tokens.js'

// The top of the dashboard: a time-of-day greeting with the person's name, today's date, one line about how today stands,
// the main buttons, and a ring showing today's progress.
// The greeting band is as tall as the sidebar's logo block beside it, so the two line up.
export const BAND_HEIGHT = 176

export default function GreetingBand({ greeting, name, dateLabel, ring, account }) {
  const { t } = useI18n()
  return (
    <Box component="section" aria-label={t('Greeting')} sx={{ background: gradients.brand, color: colors.textOnDark, pt: { xs: 3, md: '56px' }, pb: { xs: 3, md: 0 }, height: { md: BAND_HEIGHT }, display: { md: 'flex' }, alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
      <Box aria-hidden="true" sx={{ position: 'absolute', right: -120, top: -140, width: 420, height: 420, borderRadius: '50%', bgcolor: 'rgba(124, 240, 192, 0.2)', filter: 'blur(90px)', pointerEvents: 'none' }} />
      {account && <Box sx={{ display: { xs: 'none', md: 'block' }, position: 'absolute', top: 20, right: 32, zIndex: 1 }}>{account}</Box>}
      <Container sx={{ position: 'relative', maxWidth: `${contentWidths.page}px !important`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 3, flexDirection: { xs: 'column', md: 'row' }, textAlign: { xs: 'center', md: 'left' } }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h1" component="h1" sx={{ fontSize: { xs: '1.75rem', sm: '2.2rem', md: '2.5rem' }, lineHeight: 1.12, mb: 0, overflowWrap: 'anywhere', ...enter(100, 800) }}>
            {t(greeting)},{' '}
            <Box component="span" sx={{ background: gradients.accentText, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {name}
            </Box>
          </Typography>
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, mt: 0.5, color: colors.mint300, fontWeight: 600, fontSize: '0.875rem', ...enter(0, 600) }}>
            <CalendarDays size={15} aria-hidden="true" />
            {dateLabel}
          </Box>
        </Box>
        {ring}
      </Container>
    </Box>
  )
}
