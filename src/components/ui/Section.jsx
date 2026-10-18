import { Box, Container, Typography } from '@mui/material'
import { colors, contentWidths, gradients, navOuterHeight, sectionSpacing } from '../../theme/tokens.js'

const tones = {
  light: { bg: 'transparent', color: 'text.primary' },
  alt: { bg: colors.bgAlt, color: 'text.primary' },
  dark: { bg: gradients.brand, color: colors.textOnDark },
}

// Consistent page-width, vertical rhythm and background for each landing section.
export function Section({ id, tone = 'light', children, sx, narrow = false }) {
  const t = tones[tone]
  return (
    <Box
      component="section"
      id={id}
      sx={{ background: t.bg, color: t.color, py: sectionSpacing, scrollMarginTop: `${navOuterHeight}px`, ...sx }}
    >
      <Container sx={{ maxWidth: `${narrow ? contentWidths.narrow : contentWidths.page}px !important` }}>
        {children}
      </Container>
    </Box>
  )
}

export function SectionHeading({ eyebrow, title, description, align = 'left', onDark = false, titleId }) {
  return (
    <Box sx={{ mb: { xs: 5, md: 7 }, maxWidth: 720, mx: align === 'center' ? 'auto' : 0, textAlign: align }}>
      {eyebrow && (
        <Typography variant="overline" component="p" sx={{ color: onDark ? colors.mint300 : colors.blue600, mb: 1.5, display: 'block' }}>
          {eyebrow}
        </Typography>
      )}
      <Typography variant="h2" component="h2" id={titleId} sx={{ mb: description ? 2 : 0 }}>
        {title}
      </Typography>
      {description && (
        <Typography variant="subtitle1" sx={{ color: onDark ? colors.textOnDarkMuted : 'text.secondary' }}>
          {description}
        </Typography>
      )}
    </Box>
  )
}
