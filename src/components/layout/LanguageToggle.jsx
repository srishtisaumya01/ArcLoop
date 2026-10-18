import { Box, ButtonBase } from '@mui/material'
import { useI18n } from '../../hooks/useI18n.js'
import { LANGUAGES } from '../../i18n/languages.js'
import { colors, navFontFamily } from '../../theme/tokens.js'

// Both languages are always shown, each in its own script, with the current one highlighted: "English | हिन्दी".
export default function LanguageToggle({ sx, fullWidth = false, onDark = false }) {
  const { lang, setLang, t } = useI18n()
  return (
    <Box
      role="group"
      aria-label={t('Language')}
      sx={{ display: fullWidth ? 'flex' : 'inline-flex', p: '3px', gap: '2px', borderRadius: '999px', border: `1px solid ${onDark ? 'rgba(255, 255, 255, 0.35)' : colors.border}`, bgcolor: onDark ? 'rgba(255, 255, 255, 0.08)' : colors.bg, ...sx }}
    >
      {LANGUAGES.map((l) => {
        const selected = l.code === lang
        return (
          <ButtonBase
            key={l.code}
            lang={l.code}
            aria-pressed={selected}
            onClick={() => setLang(l.code)}
            sx={{
              flex: fullWidth ? 1 : 'none',
              minHeight: 32,
              px: 1.5,
              borderRadius: '999px',
              fontFamily: navFontFamily,
              fontWeight: 600,
              fontSize: '0.875rem',
              whiteSpace: 'nowrap',
              color: onDark ? (selected ? colors.navy900 : 'rgba(255, 255, 255, 0.86)') : selected ? colors.onInk : colors.textSecondary,
              bgcolor: selected ? (onDark ? '#FFFFFF' : colors.ink) : 'transparent',
              transition: 'background-color 160ms ease, color 160ms ease',
              '&:hover': { color: onDark ? (selected ? colors.navy900 : '#FFFFFF') : selected ? colors.onInk : colors.textPrimary },
            }}
          >
            {l.label}
          </ButtonBase>
        )
      })}
    </Box>
  )
}
