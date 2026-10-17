import { Link as RouterLink } from 'react-router-dom'
import { Box, Container, Typography } from '@mui/material'
import { ArrowLeft } from 'lucide-react'
import { colors, contentWidths, gradients } from '../../theme/tokens.js'

// Title band shared by inner public pages. `back` = { to, label }.
export default function PageHeader({ eyebrow, title, description, back, children }) {
  return (
    <Box component="section" sx={{ background: gradients.hero, borderBottom: `1px solid ${colors.border}`, pt: { xs: 5, md: 8 }, pb: { xs: 5, md: 7 } }}>
      <Container sx={{ maxWidth: `${contentWidths.page}px !important` }}>
        {back && (
          <Box
            component={RouterLink}
            to={back.to}
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, mb: 3, color: colors.blue600, fontWeight: 600, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
          >
            <ArrowLeft size={18} aria-hidden="true" />
            {back.label}
          </Box>
        )}
        {eyebrow && (
          <Typography variant="overline" component="p" sx={{ color: colors.blue600, mb: 1.5, display: 'block' }}>
            {eyebrow}
          </Typography>
        )}
        <Typography variant="h2" component="h1" sx={{ maxWidth: 820 }}>
          {title}
        </Typography>
        {description && (
          <Typography variant="subtitle1" sx={{ color: 'text.secondary', maxWidth: 680, mt: 2 }}>
            {description}
          </Typography>
        )}
        {children && <Box sx={{ mt: 3 }}>{children}</Box>}
      </Container>
    </Box>
  )
}
