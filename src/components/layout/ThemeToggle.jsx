import { IconButton, Tooltip } from '@mui/material'
import { Moon, Sun } from 'lucide-react'
import { useThemeMode } from '../../hooks/useThemeMode.js'
import { useI18n } from '../../hooks/useI18n.js'
import { colors } from '../../theme/tokens.js'

// Switches between the light and dark theme. The icon shows what you will get, and the choice is remembered.
export default function ThemeToggle({ sx }) {
  const { mode, toggleMode } = useThemeMode()
  const { t } = useI18n()
  const toDark = mode !== 'dark'
  const label = toDark ? t('Switch to dark theme') : t('Switch to light theme')
  const Icon = toDark ? Moon : Sun
  return (
    <Tooltip title={label}>
      <IconButton
        onClick={toggleMode}
        aria-label={label}
        sx={{ width: 40, height: 40, color: colors.textPrimary, border: `1px solid ${colors.border}`, '&:hover': { bgcolor: colors.bgAlt }, ...sx }}
      >
        <Icon size={20} aria-hidden="true" />
      </IconButton>
    </Tooltip>
  )
}
