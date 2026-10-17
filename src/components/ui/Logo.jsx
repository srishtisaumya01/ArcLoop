import { Box } from '@mui/material'
import { colors } from '../../theme/tokens.js'

// Arcloop mark: a continuous loop whose open end turns upward into an arrowhead
// (the loop = repeated habit, the arrow = growth).
export function LogoMark({ size = 32, ringColor = colors.ice500, arrowColor = colors.ice500, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M22.4 8.3 A10 10 0 1 0 26 16"
        stroke={ringColor}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M22.6 15.6 L26 12.2 L29.4 15.6"
        stroke={arrowColor}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function Logo({ onDark = false, size = 32 }) {
  const ring = onDark ? colors.ice400 : colors.navy900
  const arrow = onDark ? colors.ice400 : colors.blue600
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, color: onDark ? colors.textOnDark : colors.navy900 }}>
      <LogoMark size={size} ringColor={ring} arrowColor={arrow} />
      <Box component="span" sx={{ fontWeight: 800, fontSize: '1.375rem', letterSpacing: '-0.03em', lineHeight: 1 }}>
        Arcloop
      </Box>
    </Box>
  )
}
