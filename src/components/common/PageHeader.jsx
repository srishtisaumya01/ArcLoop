import { Link as RouterLink } from 'react-router-dom'
import { Box, Container, Typography } from '@mui/material'
import { ArrowLeft } from 'lucide-react'
import { colors, contentWidths, gradients, navOuterHeight } from '../../theme/tokens.js'

const TONES = {
  light: { band: { background: gradients.hero, borderBottom: `1px solid ${colors.border}`, pt: { xs: 5, md: 8 } }, accent: colors.blue600, text: 'text.secondary' },
  brand: {
    band: {
      background: gradients.brand,
      color: colors.textOnDark,
      mt: `-${navOuterHeight}px`,
      pt: { xs: `${navOuterHeight + 40}px`, md: `${navOuterHeight + 64}px` },
    },
    accent: colors.mint300,
    text: 'rgba(255, 255, 255, 0.86)',
  },
}

// Title band shared by inner public pages. `back` = { to, label }. `tone="brand"` runs the gradient up behind the navbar.
export default function PageHeader({ eyebrow, title, description, back, children, tone = 'light' }) {
  const t = TONES[tone]
  return (
    <Box component="section" sx={{ ...t.band, pb: { xs: 5, md: 7 } }}>
      <Container sx={{ maxWidth: `${contentWidths.page}px !important` }}>
        {back && (
          <Box
            component={RouterLink}
            to={back.to}
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, mb: 3, color: t.accent, fontWeight: 600, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
          >
            <ArrowLeft size={18} aria-hidden="true" />
            {back.label}
          </Box>
        )}
        {eyebrow && (
          <Typography variant="overline" component="p" sx={{ color: t.accent, mb: 1.5, display: 'block' }}>
            {eyebrow}
          </Typography>
        )}
        <Typography variant="h2" component="h1" sx={{ maxWidth: 820 }}>
          {title}
        </Typography>
        {description && (
          <Typography variant="subtitle1" sx={{ color: t.text, maxWidth: 680, mt: 2 }}>
            {description}
          </Typography>
        )}
        {children && <Box sx={{ mt: 3 }}>{children}</Box>}
      </Container>
    </Box>
  )
}
