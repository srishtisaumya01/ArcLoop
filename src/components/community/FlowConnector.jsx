import { Box } from '@mui/material'
import { keyframes } from '@mui/material/styles'
import { colors } from '../../theme/tokens.js'

const travelX = keyframes`
  0% { left: 0; opacity: 0; }
  15% { opacity: 1; }
  85% { opacity: 1; }
  100% { left: calc(100% - 8px); opacity: 0; }
`
const travelY = keyframes`
  0% { top: 0; opacity: 0; }
  15% { opacity: 1; }
  85% { opacity: 1; }
  100% { top: calc(100% - 8px); opacity: 0; }
`

function Track({ vertical, onDark, delay, sx }) {
  const dot = onDark ? colors.mint300 : colors.blue600
  const placement = vertical
    ? { left: -3, top: 0, animation: `${travelY} 1.8s ease-in-out ${delay}s infinite` }
    : { top: -3, left: 0, animation: `${travelX} 1.8s ease-in-out ${delay}s infinite` }
  return (
    <Box
      aria-hidden="true"
      sx={{
        position: 'relative',
        flexShrink: 0,
        alignSelf: 'center',
        borderRadius: 1,
        bgcolor: onDark ? 'rgba(255, 255, 255, 0.35)' : colors.border,
        ...(vertical ? { width: 2, height: 32 } : { width: 40, height: 2 }),
        ...sx,
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          width: 8,
          height: 8,
          borderRadius: '50%',
          bgcolor: dot,
          boxShadow: `0 0 10px ${dot}`,
          ...placement,
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }}
      />
    </Box>
  )
}

// A short line with a dot travelling along it, showing data moving from one box to the next. Horizontal on wide screens
// and vertical when the diagram stacks, unless `vertical` pins it.
export default function FlowConnector({ vertical = false, onDark = false, delay = 0 }) {
  if (vertical) return <Track vertical onDark={onDark} delay={delay} />
  return (
    <>
      <Track vertical onDark={onDark} delay={delay} sx={{ display: { xs: 'block', md: 'none' } }} />
      <Track onDark={onDark} delay={delay} sx={{ display: { xs: 'none', md: 'block' } }} />
    </>
  )
}
