import { Box } from '@mui/material'
import { useThemeMode } from '../../hooks/useThemeMode.js'
import logo from '../../assets/arcloop-logo.png'
import logoLight from '../../assets/arcloop-logo-light.png'
import mark from '../../assets/arcloop-mark.png'

// The Arcloop symbol on its own (a loop that turns into an "A").
export function LogoMark({ size = 32, sx, ...props }) {
  return <Box component="img" src={mark} alt="" aria-hidden="true" draggable={false} sx={{ height: size, width: 'auto', display: 'block', ...sx }} {...props} />
}

// The full logo. The wordmark is white instead of steel blue on gradients (`onDark`) and in the dark theme.
export default function Logo({ onDark = false, size = 40 }) {
  const { mode } = useThemeMode()
  const light = onDark || mode === 'dark'
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
      <Box component="img" src={light ? logoLight : logo} alt="Arcloop" draggable={false} sx={{ height: size, width: 'auto', display: 'block' }} />
    </Box>
  )
}
