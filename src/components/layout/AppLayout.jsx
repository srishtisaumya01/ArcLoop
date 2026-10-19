import { Outlet } from 'react-router-dom'
import { Box } from '@mui/material'
import Navbar from './Navbar.jsx'
import ScrollManager from './ScrollManager.jsx'
import Footer from './Footer.jsx'
import BottomNav, { BottomNavSpace } from './BottomNav.jsx'
import ChallengeBanner from '../challenge/ChallengeBanner.jsx'
import { useAuth } from '../../hooks/useAuth.js'
import { useI18n } from '../../hooks/useI18n.js'
import { SITE_TABS, SITE_TAB_APP, SITE_TAB_LOGIN } from '../../constants/navigation.js'

export default function AppLayout() {
  const { t } = useI18n()
  const { status } = useAuth()
  // The last tab is the way in; left out while the session is being checked, so a signed-in person never sees "Log in" flash.
  const tabs = status === 'loading' ? SITE_TABS : [...SITE_TABS, status === 'authenticated' ? SITE_TAB_APP : SITE_TAB_LOGIN]
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Box
        component="a"
        href="#main"
        sx={{
          position: 'absolute',
          left: 16,
          top: -80,
          zIndex: 2000,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          px: 2,
          py: 1,
          borderRadius: 1,
          '&:focus': { top: 16 },
        }}
      >
        {t('Skip to content')}
      </Box>
      <ScrollManager />
      <ChallengeBanner />
      <Navbar />
      <Box component="main" id="main" tabIndex={-1} sx={{ flex: 1, outline: 'none', position: 'relative' }}>
        <Outlet />
      </Box>
      <Footer />
      <BottomNavSpace />
      <BottomNav items={tabs} label={t('Quick navigation')} />
    </Box>
  )
}
