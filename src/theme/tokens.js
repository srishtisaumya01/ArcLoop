// Single source of truth for Arcloop design tokens.
// Everything visual (MUI theme, components) reads from here.

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
  // Interactive blue for use on light surfaces (5.9:1 on white).
  blue600: '#1B5BC8',
  blue700: '#144AA6',
  bg: '#F5F8FC',
  bgAlt: '#EAF1F9',
  surface: '#FFFFFF',
  border: '#D9E2EE',
  textPrimary: '#0B1B3A',
  textSecondary: '#44546F',
  textMuted: '#5B6B85',
  textOnDark: '#FFFFFF',
  textOnDarkMuted: '#B8C6DD',
  success: '#0F7B53',
  warning: '#9A5B00',
  error: '#B42318',
}

export const fontFamily =
  '"Plus Jakarta Sans Variable", "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

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

// Fine film grain laid over the brand gradient so large flat areas do not band.
const grain =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.07 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

export const gradients = {
  hero: `radial-gradient(900px 480px at 85% 0%, ${colors.ice300}66, transparent 70%), ${colors.bg}`,
  brand: `${grain}, linear-gradient(115deg, ${colors.royal900} 0%, ${colors.royal800} 38%, ${colors.teal700} 70%, ${colors.mint400} 100%)`,
  brandVertical: `${grain}, linear-gradient(160deg, ${colors.royal900} 0%, ${colors.royal800} 45%, ${colors.teal700} 80%, ${colors.mint400} 115%)`,
  accentText: `linear-gradient(90deg, ${colors.mint300}, ${colors.ice300})`,
}

// Buttons placed on the brand gradient: a solid white primary and a frosted "glass" secondary with a soft glow.
export const onBrandButtons = {
  solid: {
    bgcolor: colors.surface,
    color: colors.navy900,
    '&:hover': { bgcolor: colors.bgAlt, transform: 'translateY(-1px)' },
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
  series1: '#2a78d6',
  series2: '#1baf7a',
  grid: '#E3E9F2',
  surface: '#FFFFFF',
}

export const contentWidths = { page: 1200, narrow: 760 }

export const breakpoints = { xs: 0, sm: 600, md: 900, lg: 1200, xl: 1536 }

export const focusRing = {
  outline: `3px solid ${colors.ice500}`,
  outlineOffset: 2,
}

export const motion = {
  fast: '150ms',
  base: '240ms',
  easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
}

export const navHeight = 72

// The navbar floats as a card with this much space above and below it.
export const navGap = 16

// Full space the sticky navbar takes; a page section can pull up by this much to run its background behind the nav.
export const navOuterHeight = navHeight + navGap * 2
