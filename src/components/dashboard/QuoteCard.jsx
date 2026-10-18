import { Box, Typography } from '@mui/material'
import { Quote } from 'lucide-react'
import Typewriter from '../ui/Typewriter.jsx'
import { useI18n } from '../../hooks/useI18n.js'
import { quoteOfTheDay } from '../../constants/quotes.js'
import { colors, radii, shadows } from '../../theme/tokens.js'

// A small card with the quote of the day, typed out letter by letter, on mixed theme colours. It changes every day.
export default function QuoteCard({ now = new Date() }) {
  const { t } = useI18n()
  const { text, author } = quoteOfTheDay(now)
  return (
    <Box
      component="figure"
      sx={{
        m: 0,
        flex: '1 1 320px',
        minWidth: 0,
        px: 2.5,
        py: 1.75,
        borderRadius: `${radii.md}px`,
        color: '#FFFFFF',
        boxShadow: shadows.sm,
        background: 'radial-gradient(200px 140px at 100% 0%, rgba(124, 92, 255, 0.55), transparent 70%), radial-gradient(220px 160px at 0% 100%, rgba(46, 214, 139, 0.5), transparent 70%), linear-gradient(160deg, #0A1F66 0%, #17698F 100%)',
      }}
    >
      <Typography variant="overline" component="figcaption" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: colors.mint300, lineHeight: 1.6 }}>
        <Quote size={14} aria-hidden="true" />
        {t('Quote of the day')}
      </Typography>
      <Typography component="blockquote" sx={{ m: 0, fontSize: '0.975rem', lineHeight: 1.45, fontWeight: 600 }}>
        <Typewriter speed={28} segments={[{ text: `“${text}”` }]} />
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.5, color: 'rgba(255, 255, 255, 0.85)', fontWeight: 600 }}>— {author}</Typography>
    </Box>
  )
}
