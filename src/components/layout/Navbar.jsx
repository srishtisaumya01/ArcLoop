import { useState } from 'react'
import { Link as RouterLink, NavLink, useNavigate } from 'react-router-dom'
import { AppBar, Box, Button, Container, Drawer, IconButton, Toolbar } from '@mui/material'
import { Mail, Menu, X } from 'lucide-react'
import Logo from '../ui/Logo.jsx'
import LanguageToggle from './LanguageToggle.jsx'
import ThemeToggle from './ThemeToggle.jsx'
import { useAuth } from '../../hooks/useAuth.js'
import { useI18n } from '../../hooks/useI18n.js'
import { APP_LINKS, NAV_LINKS, ROUTES } from '../../constants/navigation.js'
import { colors, contentWidths, navFontFamily, navGap, navHeight, shadows } from '../../theme/tokens.js'

const navLinkSx = {
  color: colors.textSecondary,
  fontFamily: navFontFamily,
  fontWeight: 500,
  fontSize: '1rem',
  letterSpacing: '0.01em',
  px: 1.25,
  py: 1,
  whiteSpace: 'nowrap',
  borderRadius: 2,
  textDecoration: 'none',
  '&:hover': { color: colors.textPrimary, bgcolor: colors.bgAlt },
  '&[aria-current="page"]': { color: colors.textPrimary, bgcolor: colors.bgAlt },
}

const navButtonSx = { whiteSpace: 'nowrap', fontFamily: navFontFamily, fontWeight: 600, fontSize: '0.9375rem', letterSpacing: '0.01em', minHeight: 40, px: 2, py: '6px' }

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  const { status, signOut } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const signedIn = status === 'authenticated'
  const checking = status === 'loading' // avoid flashing the signed-out buttons at signed-in users
  // Signed-in users get the app's own navigation; NavLink marks the current page with aria-current.
  const links = signedIn ? APP_LINKS : NAV_LINKS
  const linkComponent = signedIn ? NavLink : RouterLink

  const handleLogout = async () => {
    close()
    try {
      await signOut()
    } catch {
      // The local session is cleared even if the server call fails.
    }
    navigate(ROUTES.home)
  }

  return (
    <AppBar position="sticky" color="transparent" elevation={0} sx={{ py: `${navGap}px`, boxShadow: 'none', pointerEvents: 'none' }}>
      <Container sx={{ maxWidth: `${contentWidths.page}px !important`, pointerEvents: 'auto' }}>
        <Toolbar
          disableGutters
          sx={{
            minHeight: `${navHeight}px !important`,
            gap: 1.5,
            px: { xs: 2, md: 2.5 },
            bgcolor: colors.surface,
            borderRadius: '20px',
            border: `1px solid ${colors.border}`,
            boxShadow: shadows.md,
          }}
        >
          <Box component={RouterLink} to={ROUTES.home} aria-label={t('Arcloop home')} sx={{ textDecoration: 'none', borderRadius: 1, flexShrink: 0 }}>
            <Logo size={40} />
          </Box>

          <Box component="nav" aria-label={signedIn ? 'App' : 'Primary'} sx={{ display: { xs: 'none', nav: 'flex' }, gap: 0.25, ml: 1.5 }}>
            {links.map((l) => (
              <Box key={l.label} component={linkComponent} to={l.to} sx={navLinkSx}>
                {signedIn ? l.label : t(l.label)}
              </Box>
            ))}
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          <Box sx={{ display: { xs: 'none', nav: 'flex' }, flexShrink: 0, gap: 1, alignItems: 'center' }}>
            {signedIn && (
              <>
                <Button color="primary" size="small" onClick={handleLogout} sx={navButtonSx}>
                  {t('Log out')}
                </Button>
                <Button component={RouterLink} to={ROUTES.app} variant="contained" color="primary" size="small" sx={navButtonSx}>
                  {t('Open app')}
                </Button>
              </>
            )}
            {!signedIn && !checking && (
              <>
                <Button component={RouterLink} to={ROUTES.contact} variant="outlined" color="primary" size="small" startIcon={<Mail size={16} aria-hidden="true" />} sx={navButtonSx}>
                  {t('Get in touch')}
                </Button>
                <Button component={RouterLink} to={ROUTES.signup} variant="contained" color="primary" size="small" sx={navButtonSx}>
                  {t('Start Your Journey')}
                </Button>
              </>
            )}
            <Box aria-hidden="true" sx={{ width: '1px', height: 24, mx: 0.5, bgcolor: colors.border }} />
            <LanguageToggle />
            <ThemeToggle />
          </Box>

          <IconButton
            aria-label={t('Open menu')}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen(true)}
            sx={{ display: { nav: 'none' }, width: 48, height: 48 }}
          >
            <Menu size={26} />
          </IconButton>
        </Toolbar>
      </Container>

      <Drawer
        anchor="right"
        open={open}
        onClose={close}
        slotProps={{ paper: { id: 'mobile-menu', sx: { width: 'min(86vw, 340px)', p: 3, bgcolor: colors.bg, backgroundImage: 'none' } } }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Logo size={44} />
          <IconButton aria-label={t('Close menu')} onClick={close} sx={{ width: 44, height: 44 }}>
            <X size={24} />
          </IconButton>
        </Box>
        <Box component="nav" aria-label="Mobile" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {links.map((l) => (
            <Box key={l.label} component={linkComponent} to={l.to} onClick={close} sx={{ ...navLinkSx, fontSize: '1.0625rem', px: 1.5, py: 1.5 }}>
              {signedIn ? l.label : t(l.label)}
            </Box>
          ))}
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mt: 3 }}>
          <LanguageToggle fullWidth sx={{ flex: 1 }} />
          <ThemeToggle />
        </Box>
        <Box sx={{ mt: 'auto', display: 'flex', flexDirection: 'column', gap: 1.5, pt: 4 }}>
          {signedIn && (
            <>
              <Button component={RouterLink} to={ROUTES.app} onClick={close} variant="contained" color="primary" size="large">
                {t('Open app')}
              </Button>
              <Button onClick={handleLogout} variant="outlined" color="primary" size="large">
                {t('Log out')}
              </Button>
            </>
          )}
          {!signedIn && !checking && (
            <>
              <Button component={RouterLink} to={ROUTES.signup} onClick={close} variant="contained" color="primary" size="large">
                {t('Start Your Journey')}
              </Button>
              <Button component={RouterLink} to={ROUTES.contact} onClick={close} variant="outlined" color="primary" size="large">
                {t('Get in touch')}
              </Button>
            </>
          )}
        </Box>
      </Drawer>
    </AppBar>
  )
}
