import { Box, Container, Typography } from '@mui/material'
import { CalendarDays } from 'lucide-react'
import TodayRing from './TodayRing.jsx'
import { useI18n } from '../../hooks/useI18n.js'
import { enter } from '../../theme/animations.js'
import { colors, contentWidths, gradients } from '../../theme/tokens.js'

// The top of the dashboard: a time-of-day greeting with the person's name, today's date, one line about how today stands,
// the main buttons, and a ring showing today's progress.
export default function GreetingBand({ greeting, name, dateLabel, message, ring, account, children }) {
  const { t } = useI18n()
  return (
    <Box component="section" aria-label={t('Greeting')} sx={{ background: gradients.brand, color: colors.textOnDark, pt: { xs: 4, md: 9 }, pb: { xs: 5, md: 7 }, position: 'relative', overflow: 'hidden' }}>
      <Box aria-hidden="true" sx={{ position: 'absolute', right: -120, top: -140, width: 420, height: 420, borderRadius: '50%', bgcolor: 'rgba(124, 240, 192, 0.2)', filter: 'blur(90px)', pointerEvents: 'none' }} />
      {account && <Box sx={{ display: { xs: 'none', md: 'block' }, position: 'absolute', top: 20, right: 32, zIndex: 1 }}>{account}</Box>}
      <Container sx={{ position: 'relative', maxWidth: `${contentWidths.page}px !important`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, flexDirection: { xs: 'column', md: 'row' }, textAlign: { xs: 'center', md: 'left' } }}>
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, mb: 2, px: 1.5, py: 0.5, borderRadius: '999px', bgcolor: 'rgba(255, 255, 255, 0.14)', color: colors.mint300, fontWeight: 600, fontSize: '0.875rem', ...enter(0, 600) }}>
            <CalendarDays size={16} aria-hidden="true" />
            {dateLabel}
          </Box>
          <Typography variant="h1" component="h1" sx={{ fontSize: { xs: '2rem', sm: '2.6rem', md: '3.25rem' }, lineHeight: 1.12, mb: 1.5, overflowWrap: 'anywhere', ...enter(100, 800) }}>
            {t(greeting)},{' '}
            <Box component="span" sx={{ background: gradients.accentText, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {name}
            </Box>
          </Typography>
          <Typography variant="subtitle1" sx={{ color: 'rgba(255, 255, 255, 0.88)', maxWidth: 560, mx: { xs: 'auto', md: 0 }, mb: 3, ...enter(220, 800) }}>
            {message}
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: { xs: 'center', md: 'flex-start' }, ...enter(340, 800) }}>{children}</Box>
        </Box>
        {ring}
      </Container>
    </Box>
  )
}
