import { Box, Container, Typography } from '@mui/material'
import { colors, contentWidths, sectionSpacing } from '../../theme/tokens.js'

const tones = {
  light: { bg: 'transparent', color: 'text.primary' },
  alt: { bg: colors.bgAlt, color: 'text.primary' },
  dark: { bg: colors.navy900, color: colors.textOnDark },
}

// Consistent page-width, vertical rhythm and background for each landing section.
export function Section({ id, tone = 'light', children, sx, narrow = false }) {
  const t = tones[tone]
  return (
    <Box
      component="section"
      id={id}
      sx={{ bgcolor: t.bg, color: t.color, py: sectionSpacing, scrollMarginTop: '72px', ...sx }}
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
        <Typography variant="overline" component="p" sx={{ color: onDark ? colors.ice400 : colors.blue600, mb: 1.5, display: 'block' }}>
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
