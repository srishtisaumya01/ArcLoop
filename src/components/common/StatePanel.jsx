import { Box, Typography } from '@mui/material'
import { colors, radii } from '../../theme/tokens.js'

// Designed empty / error panel. `role="alert"` is used for errors only.
// `headingLevel` 1 is for panels that replace the whole page (e.g. not found).
export default function StatePanel({ icon: Icon, title, text, action, tone = 'neutral', headingLevel = 2 }) {
  const isError = tone === 'error'
  return (
    <Box
      role={isError ? 'alert' : 'status'}
      sx={{
        textAlign: 'center',
        px: 3,
        py: { xs: 6, md: 8 },
        borderRadius: `${radii.lg}px`,
        border: `1px dashed ${isError ? colors.error : colors.border}`,
        bgcolor: colors.surface,
      }}
    >
      {Icon && (
        <Box sx={{ width: 56, height: 56, mx: 'auto', mb: 2, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: isError ? colors.errorBg : colors.bgAlt, color: isError ? colors.error : colors.blue600 }}>
          <Icon size={26} aria-hidden="true" />
        </Box>
      )}
      <Typography variant="h3" component={`h${headingLevel}`} sx={{ mb: 1 }}>
        {title}
      </Typography>
      {text && (
        <Typography color="text.secondary" sx={{ maxWidth: 460, mx: 'auto', mb: action ? 3 : 0 }}>
          {text}
        </Typography>
      )}
      {action}
    </Box>
  )
}
