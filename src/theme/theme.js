import { createTheme } from '@mui/material/styles'
import {
  bottomNavClearance,
  breakpoints,
  colors,
  focusRing,
  fontFamily,
  motion,
  radii,
  shadows,
  spacingUnit,
  typeScale,
} from './tokens.js'

const transition = `background-color ${motion.fast} ${motion.easing}, border-color ${motion.fast} ${motion.easing}, box-shadow ${motion.fast} ${motion.easing}, transform ${motion.fast} ${motion.easing}, color ${motion.fast} ${motion.easing}`

// MUI derives hover/contrast shades from these, so they are real colours (the CSS-variable tokens cannot be used here).
const palettes = {
  light: {
    mode: 'light',
    primary: { main: '#0B1B3A', dark: '#06122B', light: '#243B66', contrastText: '#FFFFFF' },
    secondary: { main: colors.ice400, dark: colors.ice500, light: colors.ice300, contrastText: '#0B1B3A' },
    info: { main: '#1B5BC8' },
    success: { main: '#0F7B53' },
    warning: { main: '#9A5B00' },
    error: { main: '#B42318' },
    background: { default: '#F5F8FC', paper: '#FFFFFF' },
    text: { primary: '#0B1B3A', secondary: '#44546F', disabled: '#5B6B85' },
    divider: '#D9E2EE',
  },
  dark: {
    mode: 'dark',
    primary: { main: '#EAF1FF', dark: '#C5D6F5', light: '#FFFFFF', contrastText: '#0B1B3A' },
    secondary: { main: colors.ice400, dark: colors.ice500, light: colors.ice300, contrastText: '#0B1B3A' },
    info: { main: '#7DB2FF' },
    success: { main: '#4ADE9B' },
    warning: { main: '#F5B54A' },
    error: { main: '#FF9A90' },
    background: { default: '#0A1730', paper: '#11254A' },
    text: { primary: '#EAF1FF', secondary: '#B7C5E0', disabled: '#94A6C9' },
    divider: '#2A4070',
  },
}

export function createAppTheme(mode = 'light') {
  const palette = palettes[mode] ?? palettes.light
  return createTheme({
    breakpoints: { values: breakpoints },
    spacing: spacingUnit,
    shape: { borderRadius: radii.md },
    palette,
    typography: {
      fontFamily,
      h1: typeScale.display,
      h2: typeScale.h2,
      h3: typeScale.h3,
      h4: typeScale.h4,
      h5: typeScale.h4,
      h6: typeScale.h4,
      subtitle1: typeScale.lead,
      body1: typeScale.body,
      body2: typeScale.small,
      button: { fontWeight: 700, textTransform: 'none', letterSpacing: 0 },
      overline: typeScale.eyebrow,
    },
    components: {
      // Subtitles are sentences, not headings: MUI would otherwise render subtitle1/2 as <h6>, skipping heading levels.
      MuiTypography: { defaultProps: { variantMapping: { subtitle1: 'p', subtitle2: 'p' } } },
      MuiCssBaseline: {
        styleOverrides: {
          body: { color: colors.textPrimary, WebkitFontSmoothing: 'antialiased' },
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': {
              animationDuration: '0.01ms !important',
              animationIteration: '1 !important',
              transitionDuration: '0.01ms !important',
              scrollBehavior: 'auto !important',
            },
          },
          // On a phone the tab bar (and sometimes a notice) is fixed to the bottom of the screen: keyboard focus scrolls a field clear of
          // them rather than to the very edge, where they would cover it.
          '@media (max-width: 899.95px)': { html: { scrollPaddingBottom: `calc(${bottomNavClearance} + var(--floating-notice-height, 0px) + 16px)` } },
          'a:focus-visible, button:focus-visible, [tabindex]:focus-visible, summary:focus-visible': focusRing,
        },
      },
      MuiButtonBase: {
        defaultProps: { disableRipple: false },
        styleOverrides: { root: { '&.Mui-focusVisible': focusRing } },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: radii.pill,
            minHeight: 44,
            padding: '10px 24px',
            transition,
          },
          sizeLarge: { minHeight: 52, padding: '14px 32px', fontSize: '1rem' },
          sizeSmall: { minHeight: 40, padding: '6px 18px' },
          containedPrimary: ({ theme }) => ({
            '&:hover': { backgroundColor: theme.palette.primary.light, transform: 'translateY(-1px)' },
          }),
          containedSecondary: {
            '&:hover': { backgroundColor: colors.ice300, transform: 'translateY(-1px)' },
          },
          outlinedPrimary: {
            borderColor: colors.ink,
            borderWidth: 1.5,
            '&:hover': { borderWidth: 1.5, backgroundColor: colors.bgAlt, borderColor: colors.ink },
          },
          // "onDark" variant: outlined button for navy surfaces.
          outlinedSecondary: {
            color: colors.textOnDark,
            borderColor: 'rgba(255,255,255,0.45)',
            borderWidth: 1.5,
            '&:hover': { borderWidth: 1.5, borderColor: colors.ice400, backgroundColor: 'rgba(255,255,255,0.08)' },
          },
          text: { '&:hover': { backgroundColor: colors.bgAlt } },
        },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            borderRadius: radii.lg,
            border: `1px solid ${colors.border}`,
            boxShadow: shadows.sm,
            backgroundImage: 'none',
            transition,
          },
        },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            backgroundColor: colors.surface,
            transition,
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: colors.textMuted },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: colors.blue600, borderWidth: 2 },
            '&.Mui-focused': { boxShadow: `0 0 0 4px ${colors.ice300}55` },
            '&.Mui-error.Mui-focused': { boxShadow: 'none' },
          },
          notchedOutline: { borderColor: colors.border },
        },
      },
      MuiAccordion: {
        defaultProps: { disableGutters: true, elevation: 0, square: true },
        styleOverrides: {
          root: {
            background: 'transparent',
            borderBottom: `1px solid ${colors.border}`,
            '&::before': { display: 'none' },
          },
        },
      },
      // Notices here are static page content, not urgent errors. Dynamic updates are
      // announced through aria-live wrappers at the call site.
      MuiAlert: { defaultProps: { role: 'note' } },
      MuiChip: { styleOverrides: { root: { fontWeight: 600, borderRadius: radii.pill } } },
      MuiLink: {
        defaultProps: { underline: 'hover' },
        styleOverrides: { root: { color: colors.blue600, '&:hover': { color: colors.blue700 } } },
      },
    },
  })
}

const theme = createAppTheme('light')

export default theme
