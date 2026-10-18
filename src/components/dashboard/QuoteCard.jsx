import { Box, Typography } from '@mui/material'
import { Quote } from 'lucide-react'
import Reveal from '../ui/Reveal.jsx'
import { useI18n } from '../../hooks/useI18n.js'
import { quoteOfTheDay } from '../../constants/quotes.js'
import { colors, radii, shadows } from '../../theme/tokens.js'

// The quote of the day, on a card of mixed theme colours (violet, blue, teal and mint). It changes every day.
export default function QuoteCard({ now = new Date() }) {
  const { t } = useI18n()
  const { text, author } = quoteOfTheDay(now)
  return (
    <Reveal delay={120}>
      <Box
        component="figure"
        sx={{
          m: 0,
          p: 3,
          borderRadius: `${radii.lg}px`,
          color: '#FFFFFF',
          boxShadow: shadows.md,
          position: 'relative',
          overflow: 'hidden',
          background: 'radial-gradient(240px 200px at 100% 0%, rgba(124, 92, 255, 0.55), transparent 70%), radial-gradient(260px 220px at 0% 100%, rgba(46, 214, 139, 0.55), transparent 70%), linear-gradient(160deg, #0A1F66 0%, #17698F 100%)',
        }}
      >
        <Typography variant="overline" component="figcaption" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: colors.mint300, mb: 1.5 }}>
          <Quote size={16} aria-hidden="true" />
          {t('Quote of the day')}
        </Typography>
        <Typography component="blockquote" sx={{ m: 0, fontSize: '1.2rem', lineHeight: 1.45, fontWeight: 600 }}>
          “{text}”
        </Typography>
        <Typography sx={{ mt: 2, color: 'rgba(255, 255, 255, 0.85)', fontWeight: 600 }}>— {author}</Typography>
      </Box>
    </Reveal>
  )
}
