import { Outlet } from 'react-router-dom'
import { Box } from '@mui/material'
import Navbar from './Navbar.jsx'
import ScrollManager from './ScrollManager.jsx'
import Footer from './Footer.jsx'
import ChallengeBanner from '../challenge/ChallengeBanner.jsx'
import { useI18n } from '../../hooks/useI18n.js'

export default function AppLayout() {
  const { t } = useI18n()
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
    </Box>
  )
}
