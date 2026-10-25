import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Box, Drawer, IconButton } from '@mui/material'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar.jsx'
import UserMenu from './UserMenu.jsx'
import Logo from '../ui/Logo.jsx'
import BottomNav, { BottomNavSpace } from '../layout/BottomNav.jsx'
import ScrollManager from '../layout/ScrollManager.jsx'
import { AppShellContext } from '../../context/appShellContext.js'
import { NavOffsetContext } from '../../context/navOffsetContext.js'
import { useAsync } from '../../hooks/useAsync.js'
import { useAuth } from '../../hooks/useAuth.js'
import { useI18n } from '../../hooks/useI18n.js'
import { APP_TABS } from '../../constants/navigation.js'
import { PROFILE_CHANGED } from '../../hooks/profileEvents.js'
import { getMyProfile } from '../../services/profileService.js'
import { nameFor } from '../../utils/greeting.js'
import { colors, gradients } from '../../theme/tokens.js'

// Reminder delivery and the timezone suggestion belong to the signed-in app; loaded on demand so public pages never carry them.
const ReminderNotifier = lazy(() => import('../reminders/ReminderNotifier.jsx'))
const TimezonePrompt = lazy(() => import('../profile/TimezonePrompt.jsx'))

export const SIDEBAR_WIDTH = 288

// The signed-in layout: a sidebar with the app's navigation and the person's account controls, and the page beside it. On
// phones the sidebar opens from a menu button. The profile is loaded once here, for the sidebar and the dashboard.
export default function AppShell() {
  const { t } = useI18n()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  const load = useCallback(() => getMyProfile(user.id), [user.id])
  const { status, data: loaded, retry } = useAsync(load)
  // While the profile is read again after a change (a new photo, name or timezone) the page keeps showing the last one, so a screen does not
  // flash to its loading state and lose the message it was showing ("Photo updated.").
  const [kept, setKept] = useState(null)
  if (loaded && loaded !== kept) setKept(loaded)
  const profile = loaded ?? (kept && String(kept.id) === String(user.id) ? kept : null)
  useEffect(() => {
    window.addEventListener(PROFILE_CHANGED, retry) // a saved name or timezone shows up straight away
    return () => window.removeEventListener(PROFILE_CHANGED, retry)
  }, [retry])

  const value = useMemo(
    () => ({ profile, profileStatus: status, reloadProfile: retry, displayName: nameFor({ displayName: profile?.display_name, username: profile?.username ?? user.username, email: user.email }) }),
    [profile, status, retry, user.email, user.username],
  )

  return (
    <AppShellContext.Provider value={value}>
      <NavOffsetContext.Provider value={0}>
        <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: colors.bg, alignItems: 'stretch' }}>
          <Box
            component="a"
            href="#main"
            sx={{ position: 'absolute', left: 16, top: -80, zIndex: 2000, bgcolor: 'primary.main', color: 'primary.contrastText', px: 2, py: 1, borderRadius: 1, '&:focus': { top: 16 } }}
          >
            {t('Skip to content')}
          </Box>
          <ScrollManager />

          <Box component="aside" aria-label={t('Sidebar')} sx={{ display: { xs: 'none', md: 'block' }, width: SIDEBAR_WIDTH, flexShrink: 0 }}>
            <Box sx={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden' }}>
              <Sidebar navLabel="App" />
            </Box>
          </Box>

          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: { xs: 'flex', md: 'none' }, position: 'sticky', top: 0, zIndex: 1100, alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1, background: gradients.sidebar, color: '#FFFFFF' }}>
              <Logo onDark size={36} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <UserMenu onDark />
                <IconButton aria-label={t('Open menu')} aria-expanded={open} aria-controls="app-menu" onClick={() => setOpen(true)} sx={{ color: '#FFFFFF', width: 44, height: 44 }}>
                  <Menu size={24} />
                </IconButton>
              </Box>
            </Box>

            <Box component="main" id="main" tabIndex={-1} sx={{ flex: 1, position: 'relative', outline: 'none', minWidth: 0 }}>
              <Suspense fallback={null}>
                <TimezonePrompt />
                <ReminderNotifier />
              </Suspense>
              <Outlet />
            </Box>
            <BottomNavSpace />
          </Box>
          <BottomNav items={APP_TABS} label={t('Quick navigation')} />

          <Drawer anchor="left" open={open} onClose={close} slotProps={{ paper: { id: 'app-menu', sx: { width: 'min(88vw, 320px)', backgroundImage: 'none', background: gradients.sidebar } } }}>
            <Sidebar navLabel="Mobile" onNavigate={close} />
          </Drawer>
        </Box>
      </NavOffsetContext.Provider>
    </AppShellContext.Provider>
  )
}
