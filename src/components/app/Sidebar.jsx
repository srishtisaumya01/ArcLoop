import { Link as RouterLink, NavLink, useNavigate } from 'react-router-dom'
import { Box, Button, Typography } from '@mui/material'
import { keyframes } from '@mui/material/styles'
import { Bell, CalendarCheck, CalendarRange, Flame, Home, LayoutDashboard, LogOut, Repeat, Settings, TrendingUp, Trophy, Users } from 'lucide-react'
import Logo from '../ui/Logo.jsx'
import LanguageToggle from '../layout/LanguageToggle.jsx'
import ThemeToggle from '../layout/ThemeToggle.jsx'
import { useAuth } from '../../hooks/useAuth.js'
import { useAppShell } from '../../hooks/useAppShell.js'
import { useChallengeClock } from '../../hooks/useChallengeClock.js'
import { useI18n } from '../../hooks/useI18n.js'
import UserAvatar from './UserAvatar.jsx'
import { APP_NAV, EXPLORE_NAV, ROUTES, challengePath } from '../../constants/navigation.js'
import { noMotion } from '../../theme/animations.js'
import { colors, gradients, navFontFamily } from '../../theme/tokens.js'

const ICONS = {
  dashboard: LayoutDashboard,
  day: CalendarCheck,
  week: CalendarRange,
  progress: TrendingUp,
  recurring: Repeat,
  reminders: Bell,
  settings: Settings,
  challenges: Trophy,
  participants: Users,
}

const glow = keyframes`
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
`

const itemSx = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: 1.5,
  px: 1.75,
  py: 1.25,
  borderRadius: '12px',
  color: 'rgba(255, 255, 255, 0.86)',
  fontFamily: navFontFamily,
  fontWeight: 500,
  fontSize: '1rem',
  textDecoration: 'none',
  transition: 'background-color 160ms ease, color 160ms ease',
  '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)', color: '#FFFFFF' },
  '&[aria-current="page"]': {
    bgcolor: 'rgba(255, 255, 255, 0.18)',
    color: '#FFFFFF',
    fontWeight: 600,
    '&::before': { content: '""', position: 'absolute', left: -12, top: 8, bottom: 8, width: 4, borderRadius: '0 4px 4px 0', bgcolor: colors.mint300 },
  },
}

function NavList({ items, label, onNavigate }) {
  const { t } = useI18n()
  return (
    <Box component="nav" aria-label={label} sx={{ display: 'grid', gap: 0.5 }}>
      {items.map((item) => {
        const Icon = ICONS[item.icon]
        return (
          <Box key={item.to} component={NavLink} to={item.to} end={item.end} onClick={onNavigate} sx={itemSx}>
            <Icon size={20} aria-hidden="true" />
            {t(item.label)}
          </Box>
        )
      })}
    </Box>
  )
}

// A small card for the featured challenge: today's day number and how far through it is.
function ChallengeMini({ onNavigate }) {
  const { t } = useI18n()
  const live = useChallengeClock()
  if (!live || live.clock.status !== 'live') return null
  const { challenge, clock } = live
  return (
    <Box
      component={RouterLink}
      to={challengePath(challenge.slug)}
      onClick={onNavigate}
      sx={{ display: 'block', p: 1.75, borderRadius: '14px', bgcolor: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.22)', color: '#FFFFFF', textDecoration: 'none', '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.16)' } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: colors.mint300, fontWeight: 700, fontSize: '0.875rem' }}>
        <Flame size={16} aria-hidden="true" />
        {t(challenge.title)}
        <Box aria-hidden="true" sx={{ ml: 'auto', width: 8, height: 8, borderRadius: '50%', bgcolor: colors.mint300, animation: `${glow} 1.8s ease-in-out infinite`, ...noMotion }} />
      </Box>
      <Typography sx={{ fontWeight: 800, fontSize: '1.0625rem', mt: 0.5 }}>{t('Day {day} of {total}', { day: clock.dayNumber, total: clock.totalDays })}</Typography>
      <Box aria-hidden="true" sx={{ mt: 1, height: 6, borderRadius: 3, bgcolor: 'rgba(255, 255, 255, 0.22)', overflow: 'hidden' }}>
        <Box sx={{ width: `${Math.round(clock.progress * 100)}%`, height: '100%', borderRadius: 3, background: gradients.accentText }} />
      </Box>
      <Typography variant="body2" sx={{ mt: 0.75, color: 'rgba(255, 255, 255, 0.82)' }}>
        {clock.daysLeft === 0 ? t('Last day today') : t('{count} days left', { count: clock.daysLeft })}
      </Typography>
    </Box>
  )
}

// The signed-in sidebar: the app's navigation and everything the top navbar used to hold for a signed-in person (their
// account, language and theme, and Log out).
export default function Sidebar({ navLabel = 'App', onNavigate }) {
  const { t } = useI18n()
  const { user, signOut } = useAuth()
  const { displayName, profile } = useAppShell()
  const navigate = useNavigate()
  const name = displayName || user?.email || ''

  const logOut = async () => {
    onNavigate?.()
    try {
      await signOut()
    } catch {
      // The local session is cleared even if the server call fails.
    }
    navigate(ROUTES.home)
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, minHeight: '100%', p: 2.5, background: gradients.sidebar, color: '#FFFFFF' }}>
      <Box component={RouterLink} to={ROUTES.app} onClick={onNavigate} aria-label={t('Arcloop home')} sx={{ display: 'inline-flex', alignSelf: 'flex-start', textDecoration: 'none', px: 0.5, pt: 0.5 }}>
        <Logo onDark size={42} />
      </Box>

      <Box component={RouterLink} to={ROUTES.profile} onClick={onNavigate} aria-label={t('Profile')} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: '14px', bgcolor: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.2)', color: 'inherit', textDecoration: 'none', '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.16)' } }}>
        <UserAvatar name={name} version={profile?.avatar_version} size={44} />
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, lineHeight: 1.25, overflowWrap: 'anywhere' }}>{name}</Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.78)', overflowWrap: 'anywhere' }}>
            {profile?.username ? `@${profile.username}` : user?.email}
          </Typography>
        </Box>
      </Box>

      <NavList items={APP_NAV} label={navLabel} onNavigate={onNavigate} />

      <Box>
        <Typography variant="overline" component="p" sx={{ color: colors.mint300, px: 1.75, mb: 0.75 }}>
          {t('Explore')}
        </Typography>
        <NavList items={EXPLORE_NAV} label={t('Explore')} onNavigate={onNavigate} />
      </Box>

      <ChallengeMini onNavigate={onNavigate} />

      <Box sx={{ mt: 'auto', display: 'grid', gap: 1.5, pt: 1 }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <LanguageToggle onDark fullWidth sx={{ flex: 1 }} />
          <ThemeToggle onDark />
        </Box>
        <Box component={RouterLink} to={ROUTES.home} onClick={onNavigate} sx={{ ...itemSx, py: 1 }}>
          <Home size={20} aria-hidden="true" />
          {t('Back to website')}
        </Box>
        <Button
          onClick={logOut}
          variant="outlined"
          startIcon={<LogOut size={18} aria-hidden="true" />}
          sx={{ color: '#FFFFFF', borderColor: 'rgba(255, 255, 255, 0.5)', borderWidth: 1.5, fontFamily: navFontFamily, fontWeight: 600, justifyContent: 'center', '&:hover': { borderWidth: 1.5, borderColor: '#FFFFFF', bgcolor: 'rgba(255, 255, 255, 0.12)' } }}
        >
          {t('Log out')}
        </Button>
      </Box>
    </Box>
  )
}
