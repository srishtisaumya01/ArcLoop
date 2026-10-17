import { Box, Typography } from '@mui/material'
import { colors, radii } from '../../theme/tokens.js'

// One titled card on the Settings page. Pass `component="form"` (and onSubmit) for an editable section.
export default function SettingsSection({ title, description, children, ...rest }) {
  return (
    <Box component="section" {...rest} sx={{ p: 3, borderRadius: `${radii.lg}px`, border: `1px solid ${colors.border}`, bgcolor: colors.surface, display: 'grid', gap: 2 }}>
      <Box>
        <Typography variant="h3" component="h2">{title}</Typography>
        {description && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{description}</Typography>}
      </Box>
      {children}
    </Box>
  )
}
