import { Box, Typography } from '@mui/material'
import Typewriter from '../ui/Typewriter.jsx'
import { useI18n } from '../../hooks/useI18n.js'
import { quoteOfTheDay } from '../../constants/quotes.js'
import { radii, shadows } from '../../theme/tokens.js'

// A small card with the quote of the day, typed out letter by letter, on mixed theme colours. It changes every day.
export default function QuoteCard({ now = new Date(), sx }) {
  const { t } = useI18n()
  const { text, author } = quoteOfTheDay(now)
  return (
    <Box
      component="figure"
      aria-label={t('Quote of the day')}
      sx={{
        m: 0,
        flex: '0 1 auto',
        ml: { md: 'auto' },
        maxWidth: 'calc(100vw - 48px)',
        minWidth: 0,
        px: 2.5,
        py: 1.5,
        borderRadius: `${radii.md}px`,
        color: '#FFFFFF',
        boxShadow: shadows.sm,
        ...sx,
        background: 'radial-gradient(200px 140px at 100% 0%, rgba(124, 92, 255, 0.55), transparent 70%), radial-gradient(220px 160px at 0% 100%, rgba(46, 214, 139, 0.5), transparent 70%), linear-gradient(160deg, #0A1F66 0%, #17698F 100%)',
      }}
    >
      <Typography component="blockquote" title={text} sx={{ m: 0, fontSize: '0.8rem', lineHeight: 1.4, fontWeight: 600, whiteSpace: { xs: 'normal', md: 'nowrap' }, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        <Typewriter speed={28} segments={[{ text: `“${text}”` }]} />
      </Typography>
      <Typography variant="caption" component="p" sx={{ m: 0, mt: 0.25, color: 'rgba(255, 255, 255, 0.85)', fontWeight: 600 }}>— {author}</Typography>
    </Box>
  )
}
