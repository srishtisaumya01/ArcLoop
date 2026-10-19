// Single source of truth for Arcloop design tokens.
// Everything visual (MUI theme, components) reads from here.

// Colours that change with the light/dark theme are CSS variables (defined in styles/global.css, with the light value as
// the fallback); the brand and on-gradient colours below are fixed hex values.
const themed = (name, fallback) => `var(--ac-${name}, ${fallback})`

export const colors = {
  navy950: '#06122B',
  navy900: '#0B1B3A',
  navy800: '#14294F',
  navy700: '#243B66',
  ice300: '#A9DDF9',
  ice400: '#7CC8F5',
  ice500: '#4DB0EA',
  royal900: '#0A1F66',
  royal800: '#0F2F86',
  teal700: '#17698F',
  mint300: '#7CF0C0',
  mint400: '#2ED68B',
  textOnDark: '#FFFFFF',
  textOnDarkMuted: '#B8C6DD',
  // Interactive blue for use on the page surface (5.9:1 on white in light mode).
  blue600: themed('blue600', '#1B5BC8'),
  blue700: themed('blue700', '#144AA6'),
  bg: themed('bg', '#F5F8FC'),
  bgAlt: themed('bg-alt', '#EAF1F9'),
  surface: themed('surface', '#FFFFFF'),
  border: themed('border', '#D9E2EE'),
  textPrimary: themed('text-primary', '#0B1B3A'),
  textSecondary: themed('text-secondary', '#44546F'),
  textMuted: themed('text-muted', '#5B6B85'),
  // Filled "ink" elements (dark chip in light mode, light chip in dark mode) and the text that sits on them.
  ink: themed('ink', '#0B1B3A'),
  onInk: themed('on-ink', '#FFFFFF'),
  success: themed('success', '#0F7B53'),
  warning: themed('warning', '#9A5B00'),
  error: themed('error', '#B42318'),
  errorBg: themed('error-bg', '#FDECEA'),
}

export const fontFamily =
  '"Plus Jakarta Sans Variable", "Plus Jakarta Sans", "Noto Sans Devanagari Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

// The navigation bar's own face: Outfit for Latin text, with Noto Sans Devanagari for Hindi.
export const navFontFamily =
  '"Outfit Variable", "Outfit", "Noto Sans Devanagari Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

// Fluid type scale (rem-based clamp so headings scale with viewport).
export const typeScale = {
  display: { fontSize: 'clamp(2.5rem, 1.6rem + 3.8vw, 4.5rem)', lineHeight: 1.05, letterSpacing: '-0.03em', fontWeight: 800 },
  h2: { fontSize: 'clamp(2rem, 1.4rem + 2.2vw, 3rem)', lineHeight: 1.12, letterSpacing: '-0.025em', fontWeight: 800 },
  h3: { fontSize: 'clamp(1.375rem, 1.15rem + 0.9vw, 1.75rem)', lineHeight: 1.25, letterSpacing: '-0.015em', fontWeight: 700 },
  h4: { fontSize: '1.125rem', lineHeight: 1.35, letterSpacing: '-0.01em', fontWeight: 700 },
  lead: { fontSize: 'clamp(1.0625rem, 1rem + 0.35vw, 1.25rem)', lineHeight: 1.6, fontWeight: 400 },
  body: { fontSize: '1rem', lineHeight: 1.6, fontWeight: 400 },
  small: { fontSize: '0.875rem', lineHeight: 1.5, fontWeight: 400 },
  eyebrow: { fontSize: '0.8125rem', lineHeight: 1.2, letterSpacing: '0.08em', fontWeight: 700 },
}

// Spacing unit in px (MUI theme.spacing(n) = n * spacingUnit).
export const spacingUnit = 8

// Vertical rhythm between landing sections (MUI spacing units).
export const sectionSpacing = { xs: 9, md: 14 }

export const radii = { sm: 8, md: 14, lg: 24, pill: 999 }

export const shadows = {
  sm: '0 1px 2px rgba(11, 27, 58, 0.06), 0 1px 3px rgba(11, 27, 58, 0.08)',
  md: '0 6px 20px rgba(11, 27, 58, 0.08)',
  lg: '0 24px 60px rgba(11, 27, 58, 0.16)',
}

export const gradients = {
  hero: `radial-gradient(900px 480px at 85% 0%, ${colors.ice300}66, transparent 70%), ${colors.bg}`,
  brand: `linear-gradient(115deg, ${colors.royal900} 0%, ${colors.royal800} 38%, ${colors.teal700} 70%, ${colors.mint400} 100%)`,
  brandVertical: `linear-gradient(160deg, ${colors.royal900} 0%, ${colors.royal800} 45%, ${colors.teal700} 80%, ${colors.mint400} 115%)`,
  accentText: `linear-gradient(90deg, ${colors.mint300}, ${colors.ice300})`,
  // The footer: the brand gradient, kept dark all the way across so white link text stays readable.
  footer: `linear-gradient(120deg, ${colors.royal900} 0%, ${colors.royal800} 40%, ${colors.teal700} 78%, #14806E 100%)`,
  // The signed-in sidebar.
  sidebar: `linear-gradient(185deg, ${colors.royal900} 0%, ${colors.royal800} 55%, ${colors.teal700} 100%)`,
  // A saturated pastel of the same blue-to-mint brand gradient, for sections that keep dark text.
  tint: themed('tint', 'linear-gradient(135deg, #D2E2F8 0%, #CBE9EE 50%, #C4EBD7 100%)'),
}

// Buttons placed on the brand gradient: a solid white primary and a frosted "glass" secondary with a soft glow.
export const onBrandButtons = {
  solid: {
    bgcolor: '#FFFFFF',
    color: colors.navy900,
    '&:hover': { bgcolor: '#E6F0FF', transform: 'translateY(-1px)' },
  },
  glass: {
    color: colors.textOnDark,
    bgcolor: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.35)',
    backdropFilter: 'blur(6px)',
    boxShadow: `0 0 28px ${colors.mint300}33`,
    '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.16)', borderColor: colors.mint300, transform: 'translateY(-1px)' },
  },
}

// Chart roles. Series hues are validated as a pair (CVD and normal-vision separation); series2 sits below 3:1 on white,
// so every chart labels line ends and offers a table view.
export const chart = {
  series1: themed('series-1', '#2a78d6'),
  series2: themed('series-2', '#1baf7a'),
  grid: themed('grid', '#E3E9F2'),
  surface: themed('surface', '#FFFFFF'),
}

export const contentWidths = { page: 1200, narrow: 760 }

// `nav` is where the full navigation bar (links, buttons, language and theme) fits on one line; below it a menu button is shown.
export const breakpoints = { xs: 0, sm: 600, md: 900, lg: 1200, nav: 1260, xl: 1536 }

export const focusRing = {
  outline: `3px solid ${colors.ice500}`,
  outlineOffset: 2,
}

export const motion = {
  fast: '150ms',
  base: '240ms',
  easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
}

export const navHeight = 84

// The tab bar fixed to the bottom of a phone screen (components/layout/BottomNav.jsx). Things that sit at the bottom of the screen
// on a phone (the page's last line, messages, the timezone suggestion) keep clear of it by this much, plus the device's safe area.
export const bottomNavHeight = 64
export const bottomNavClearance = `calc(${bottomNavHeight}px + env(safe-area-inset-bottom, 0px))`

// The navbar floats as a card with this much space above and below it.
export const navGap = 16

// Full space the sticky navbar takes; a page section can pull up by this much to run its background behind the nav.
export const navOuterHeight = navHeight + navGap * 2
