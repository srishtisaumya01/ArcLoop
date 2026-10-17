import { Box, Button, Typography } from '@mui/material'
import { colors, radii } from '../../theme/tokens.js'

// A calm, dismissible note. Informational only: no counts, no tasks and no call to catch up.
export default function GentleNote({ label, heading, message, supporting, onDismiss }) {
  return (
    <Box component="section" role="region" aria-label={label} sx={{ p: 3, borderRadius: `${radii.lg}px`, bgcolor: colors.bgAlt, border: `1px solid ${colors.border}`, display: 'grid', gap: 1 }}>
      <Typography variant="h3" component="h2">{heading}</Typography>
      <Typography>{message}</Typography>
      {supporting && <Typography variant="body2" color="text.secondary">{supporting}</Typography>}
      <Box>
        <Button size="small" onClick={onDismiss} sx={{ ml: -1.25 }}>Dismiss</Button>
      </Box>
    </Box>
  )
}
