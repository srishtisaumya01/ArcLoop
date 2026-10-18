import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { AppBar, Box, Button, Container, Drawer, IconButton, Toolbar } from '@mui/material'
import { LayoutDashboard, Mail, Menu, X } from 'lucide-react'
import Logo from '../ui/Logo.jsx'
import LanguageToggle from './LanguageToggle.jsx'
import ThemeToggle from './ThemeToggle.jsx'
import { useAuth } from '../../hooks/useAuth.js'
import { useI18n } from '../../hooks/useI18n.js'
import { NAV_LINKS, ROUTES } from '../../constants/navigation.js'
import { colors, contentWidths, navFontFamily, navGap, navHeight, shadows } from '../../theme/tokens.js'

const navLinkSx = {
  color: colors.textSecondary,
  fontFamily: navFontFamily,
  fontWeight: 500,
  fontSize: '1rem',
  letterSpacing: '0.01em',
  px: 1.5,
  py: 1,
  whiteSpace: 'nowrap',
  borderRadius: 2,
  textDecoration: 'none',
  '&:hover': { color: colors.textPrimary, bgcolor: colors.bgAlt },
  '&[aria-current="page"]': { color: colors.textPrimary, bgcolor: colors.bgAlt },
}

const navButtonSx = { whiteSpace: 'nowrap', fontFamily: navFontFamily, fontWeight: 600, fontSize: '0.9375rem', letterSpacing: '0.01em', minHeight: 40, px: 2.25, py: '6px' }

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  const { status } = useAuth()
  const { t } = useI18n()
  const signedIn = status === 'authenticated'
  const checking = status === 'loading' // avoid flashing the signed-out buttons at signed-in users

  return (
    <AppBar position="sticky" color="transparent" elevation={0} sx={{ py: `${navGap}px`, boxShadow: 'none', pointerEvents: 'none' }}>
      <Container sx={{ maxWidth: `${contentWidths.page + 240}px !important`, pointerEvents: 'auto' }}>
        <Toolbar
          disableGutters
          sx={{
            minHeight: `${navHeight}px !important`,
            gap: 2,
            px: { xs: 2, md: 3 },
            bgcolor: colors.surface,
            borderRadius: '20px',
            border: `1px solid ${colors.border}`,
            boxShadow: shadows.md,
          }}
        >
          <Box component={RouterLink} to={ROUTES.home} aria-label={t('Arcloop home')} sx={{ textDecoration: 'none', borderRadius: 1, flexShrink: 0 }}>
            <Logo size={46} />
          </Box>

          <Box component="nav" aria-label="Primary" sx={{ display: { xs: 'none', nav: 'flex' }, gap: 0.5, ml: 2 }}>
            {NAV_LINKS.map((l) => (
              <Box key={l.label} component={RouterLink} to={l.to} sx={navLinkSx}>
                {t(l.label)}
              </Box>
            ))}
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          <Box sx={{ display: { xs: 'none', nav: 'flex' }, flexShrink: 0, gap: 1, alignItems: 'center' }}>
            {signedIn && (
              <Button component={RouterLink} to={ROUTES.app} variant="contained" color="primary" size="small" startIcon={<LayoutDashboard size={16} aria-hidden="true" />} sx={navButtonSx}>
                {t('Dashboard')}
              </Button>
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
          {NAV_LINKS.map((l) => (
            <Box key={l.label} component={RouterLink} to={l.to} onClick={close} sx={{ ...navLinkSx, fontSize: '1.0625rem', px: 1.5, py: 1.5 }}>
              {t(l.label)}
            </Box>
          ))}
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mt: 3 }}>
          <LanguageToggle fullWidth sx={{ flex: 1 }} />
          <ThemeToggle />
        </Box>
        <Box sx={{ mt: 'auto', display: 'flex', flexDirection: 'column', gap: 1.5, pt: 4 }}>
          {signedIn && (
            <Button component={RouterLink} to={ROUTES.app} onClick={close} variant="contained" color="primary" size="large">
              {t('Dashboard')}
            </Button>
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
