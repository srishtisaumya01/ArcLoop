import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Box } from '@mui/material'
import Navbar from './Navbar.jsx'
import Footer from './Footer.jsx'
import ChallengeBanner from '../challenge/ChallengeBanner.jsx'
import { useI18n } from '../../hooks/useI18n.js'

// React Router does not scroll to #hash targets or reset scroll by itself.
function ScrollManager() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1))
      if (el) {
        el.scrollIntoView()
        return
      }
    }
    window.scrollTo(0, 0)
  }, [pathname, hash])
  return null
}

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
