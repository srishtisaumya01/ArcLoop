import { Chip } from '@mui/material'
import { colors } from '../../theme/tokens.js'

// Marks illustrative content so it is never mistaken for real data.
export default function DemoBadge({ label = 'Sample data', onDark = false }) {
  return (
    <Chip
      size="small"
      label={label}
      sx={{
        height: 26,
        bgcolor: onDark ? 'rgba(255,255,255,0.12)' : colors.bgAlt,
        color: onDark ? colors.textOnDark : colors.textSecondary,
        border: `1px dashed ${onDark ? 'rgba(255,255,255,0.4)' : colors.textMuted}`,
      }}
    />
  )
}
