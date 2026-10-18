import { createTheme } from '@mui/material/styles'
import {
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

const theme = createTheme({
  breakpoints: { values: breakpoints },
  spacing: spacingUnit,
  shape: { borderRadius: radii.md },
  palette: {
    primary: { main: colors.navy900, dark: colors.navy950, light: colors.navy700, contrastText: colors.textOnDark },
    secondary: { main: colors.ice400, dark: colors.ice500, light: colors.ice300, contrastText: colors.navy900 },
    info: { main: colors.blue600 },
    success: { main: colors.success },
    warning: { main: colors.warning },
    error: { main: colors.error },
    background: { default: colors.bg, paper: colors.surface },
    text: { primary: colors.textPrimary, secondary: colors.textSecondary, disabled: colors.textMuted },
    divider: colors.border,
  },
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
        containedPrimary: {
          '&:hover': { backgroundColor: colors.navy700, transform: 'translateY(-1px)' },
        },
        containedSecondary: {
          '&:hover': { backgroundColor: colors.ice300, transform: 'translateY(-1px)' },
        },
        outlinedPrimary: {
          borderColor: colors.navy900,
          borderWidth: 1.5,
          '&:hover': { borderWidth: 1.5, backgroundColor: colors.bgAlt, borderColor: colors.navy900 },
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
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: colors.navy700 },
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

export default theme
