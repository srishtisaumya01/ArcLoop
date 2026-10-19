import { NavLink } from 'react-router-dom'
import { Box } from '@mui/material'
import { CalendarCheck, CalendarRange, CircleHelp, House, LayoutDashboard, LogIn, Trophy, UserRound } from 'lucide-react'
import { useI18n } from '../../hooks/useI18n.js'
import { bottomNavClearance, bottomNavHeight, colors, navFontFamily } from '../../theme/tokens.js'

const ICONS = { home: House, join: CircleHelp, challenges: Trophy, login: LogIn, dashboard: LayoutDashboard, day: CalendarCheck, week: CalendarRange, profile: UserRound }

// The tab bar fixed to the bottom of a phone or small tablet (it is hidden from 900px, where the sidebar or the top bar shows the
// same places). One icon and a short word per tab; the current page is marked with a filled pill and `aria-current`.
//   items: [{ label, to, icon, end }]    label: the name of the navigation landmark, for screen readers
export default function BottomNav({ items, label }) {
  const { t } = useI18n()
  return (
    <Box
      component="nav"
      aria-label={label}
      sx={{
        display: { xs: 'flex', md: 'none' },
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1150, // above the page and its sticky bars, below dialogs, menus and messages (1300 and up)
        minHeight: bottomNavHeight,
        pb: 'env(safe-area-inset-bottom, 0px)',
        bgcolor: colors.surface,
        borderTop: `1px solid ${colors.border}`,
        boxShadow: '0 -4px 16px rgba(15, 23, 42, 0.08)',
      }}
    >
      {items.map(({ label: name, to, icon, end }) => {
        const Icon = ICONS[icon]
        return (
          <Box
            key={to}
            component={NavLink}
            to={to}
            end={end}
            sx={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              py: 0.75,
              color: colors.textSecondary,
              fontFamily: navFontFamily,
              fontSize: '0.6875rem',
              fontWeight: 500,
              lineHeight: 1.2,
              textDecoration: 'none',
              textAlign: 'center',
              WebkitTapHighlightColor: 'transparent',
              '& .tab-icon': { display: 'grid', placeItems: 'center', width: 52, height: 30, borderRadius: '15px', transition: 'background-color 160ms ease' },
              '&:active .tab-icon': { bgcolor: colors.bgAlt },
              '&[aria-current="page"]': { color: colors.textPrimary, fontWeight: 700, '& .tab-icon': { bgcolor: colors.bgAlt } },
              '&:focus-visible': { outline: `3px solid ${colors.ice500}`, outlineOffset: -3, borderRadius: '12px' },
            }}
          >
            <span className="tab-icon">
              <Icon size={22} strokeWidth={2} aria-hidden="true" />
            </span>
            <span style={{ overflowWrap: 'anywhere' }}>{t(name)}</span>
          </Box>
        )
      })}
    </Box>
  )
}

// Empty room at the bottom of the page on a phone, so the last line of the page is not hidden behind the bar, nor behind a notice that is
// fixed above it (the timezone suggestion publishes its height as --floating-notice-height while it is showing).
export function BottomNavSpace() {
  return <Box aria-hidden="true" sx={{ display: { xs: 'block', md: 'none' }, flexShrink: 0, height: `calc(${bottomNavClearance} + var(--floating-notice-height, 0px))` }} />
}
