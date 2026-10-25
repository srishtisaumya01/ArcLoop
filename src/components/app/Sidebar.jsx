import { Link as RouterLink, NavLink, useNavigate } from 'react-router-dom'
import { Box, Button, Typography } from '@mui/material'
import { keyframes } from '@mui/material/styles'
import { Award, Bell, CalendarCheck, CalendarRange, Flame, Home, LayoutDashboard, LogOut, Repeat, Settings, UserCheck, UserRound, TrendingUp, Trophy, Users } from 'lucide-react'
import Logo from '../ui/Logo.jsx'
import LanguageToggle from '../layout/LanguageToggle.jsx'
import ThemeToggle from '../layout/ThemeToggle.jsx'
import { useAuth } from '../../hooks/useAuth.js'
import { useMyChallenges } from '../../hooks/useMyChallenges.js'
import { useI18n } from '../../hooks/useI18n.js'
import { APP_NAV, ROUTES, appChallengePath } from '../../constants/navigation.js'
import { noMotion } from '../../theme/animations.js'
import { colors, gradients, navFontFamily } from '../../theme/tokens.js'

const ICONS = {
  rewards: Award,
  profile: UserRound,
  attendance: UserCheck,
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
  py: 'clamp(4px, 1.05vh, 10px)',
  '@media (max-height: 740px)': { fontSize: '0.9375rem' },
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
    <Box component="nav" aria-label={label} sx={{ display: 'grid', gap: 'clamp(1px, 0.4vh, 4px)' }}>
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
  const { ongoing } = useMyChallenges()
  const current = ongoing.find((c) => c.clock.status === 'live') // the live challenge that finishes soonest
  if (!current) return null
  const { clock } = current
  const challenge = current
  return (
    <Box
      component={RouterLink}
      to={appChallengePath(challenge.slug)}
      onClick={onNavigate}
      sx={{ display: 'none', '@container (min-height: 66px)': { display: 'block' }, flexShrink: 0, width: 1, px: 1.5, py: 0.8, borderRadius: '12px', bgcolor: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.22)', color: '#FFFFFF', textDecoration: 'none', '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.16)' } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: colors.mint300, fontWeight: 700, fontSize: '0.8125rem', lineHeight: 1.2 }}>
        <Flame size={14} aria-hidden="true" />
        {t(challenge.title)}
        <Box aria-hidden="true" sx={{ ml: 'auto', width: 7, height: 7, borderRadius: '50%', bgcolor: colors.mint300, animation: `${glow} 1.8s ease-in-out infinite`, ...noMotion }} />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mt: 0.2 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.9375rem' }}>{t('Day {day} of {total}', { day: clock.dayNumber, total: clock.totalDays })}</Typography>
        <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.82)' }}>{clock.daysLeft === 0 ? t('Last day today') : t('{count} days left', { count: clock.daysLeft })}</Typography>
      </Box>
      <Box aria-hidden="true" sx={{ mt: 0.5, height: 5, borderRadius: 3, bgcolor: 'rgba(255, 255, 255, 0.22)', overflow: 'hidden' }}>
        <Box sx={{ width: `${Math.round(clock.progress * 100)}%`, height: '100%', borderRadius: 3, background: gradients.accentText }} />
      </Box>
    </Box>
  )
}

// The signed-in sidebar: the app's navigation and everything the top navbar used to hold for a signed-in person (their
// account, language and theme, and Log out).
export default function Sidebar({ navLabel = 'App', onNavigate }) {
  const { t } = useI18n()
  const { signOut } = useAuth()
  const navigate = useNavigate()

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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 'clamp(8px, 1.8vh, 20px)', height: '100%', overflowY: 'auto', px: 2.5, pb: 'clamp(10px, 1.8vh, 20px)', pt: { xs: 2.5, md: 0 }, background: gradients.sidebar, color: '#FFFFFF' }}>
      <Box component={RouterLink} to={ROUTES.app} onClick={onNavigate} aria-label={t('Arcloop home')} sx={{ display: 'flex', alignItems: 'center', height: { xs: 72, md: 176 }, flexShrink: 0, '@media (min-width: 900px) and (max-height: 1000px)': { height: 156 }, '@media (min-width: 900px) and (max-height: 820px)': { height: 128 }, '@media (min-width: 900px) and (max-height: 740px)': { height: 96 }, '@media (min-width: 900px) and (max-height: 700px)': { height: 76 }, mx: -2.5, px: 3, mb: -0.5, textDecoration: 'none', background: gradients.brand, boxShadow: '0 6px 18px rgba(4, 14, 50, 0.28)' }}>
        <Logo onDark size={60} />
      </Box>

      <NavList items={APP_NAV} label={navLabel} onNavigate={onNavigate} />

      {/* The free space between the menu and the controls below. The challenge card shows itself only when it fits in it (container query), so the sidebar never needs to scroll. */}
      <Box sx={{ flex: '1 1 0', minHeight: 0, containerType: 'size', display: 'flex', alignItems: 'center' }}>
        <ChallengeMini onNavigate={onNavigate} />
      </Box>

      <Box sx={{ mt: 'auto', display: 'grid', gap: 'clamp(6px, 1.2vh, 12px)', pt: 0.5 }}>
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
