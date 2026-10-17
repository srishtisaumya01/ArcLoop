import { useState } from 'react'
import { Link as RouterLink, NavLink, useNavigate } from 'react-router-dom'
import { AppBar, Box, Button, Container, Drawer, IconButton, Toolbar } from '@mui/material'
import { Menu, X } from 'lucide-react'
import Logo from '../ui/Logo.jsx'
import { useAuth } from '../../hooks/useAuth.js'
import { APP_LINKS, NAV_LINKS, ROUTES } from '../../constants/navigation.js'
import { colors, contentWidths, navHeight } from '../../theme/tokens.js'

const navLinkSx = {
  color: colors.textSecondary,
  fontWeight: 600,
  fontSize: '0.9375rem',
  px: 1.5,
  py: 1,
  borderRadius: 2,
  textDecoration: 'none',
  '&:hover': { color: colors.navy900, bgcolor: colors.bgAlt },
  '&[aria-current="page"]': { color: colors.navy900, bgcolor: colors.bgAlt },
}

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  const { status, signOut } = useAuth()
  const navigate = useNavigate()
  const signedIn = status === 'authenticated'
  const checking = status === 'loading' // avoid flashing "Log in" at signed-in users
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
    <AppBar
      position="sticky"
      color="inherit"
      elevation={0}
      sx={{
        bgcolor: 'rgba(245, 248, 252, 0.88)',
        backdropFilter: 'saturate(180%) blur(12px)',
        borderBottom: `1px solid ${colors.border}`,
      }}
    >
      <Container sx={{ maxWidth: `${contentWidths.page}px !important` }}>
        <Toolbar disableGutters sx={{ minHeight: `${navHeight}px !important`, gap: 2 }}>
          <Box component={RouterLink} to={ROUTES.home} aria-label="Arcloop home" sx={{ textDecoration: 'none', borderRadius: 1 }}>
            <Logo />
          </Box>

          <Box component="nav" aria-label={signedIn ? 'App' : 'Primary'} sx={{ display: { xs: 'none', md: 'flex' }, gap: 0.5, ml: 4 }}>
            {links.map((l) => (
              <Box key={l.label} component={linkComponent} to={l.to} sx={navLinkSx}>
                {l.label}
              </Box>
            ))}
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 1, alignItems: 'center' }}>
            {signedIn && (
              <>
                <Button color="primary" size="small" onClick={handleLogout}>
                  Log out
                </Button>
                <Button component={RouterLink} to={ROUTES.app} variant="contained" color="primary" size="small">
                  Open app
                </Button>
              </>
            )}
            {!signedIn && !checking && (
              <>
                <Button component={RouterLink} to={ROUTES.login} color="primary" size="small">
                  Log in
                </Button>
                <Button component={RouterLink} to={ROUTES.signup} variant="contained" color="primary" size="small">
                  Start Your Journey
                </Button>
              </>
            )}
          </Box>

          <IconButton
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen(true)}
            sx={{ display: { md: 'none' }, width: 44, height: 44 }}
          >
            <Menu size={24} />
          </IconButton>
        </Toolbar>
      </Container>

      <Drawer
        anchor="right"
        open={open}
        onClose={close}
        slotProps={{ paper: { id: 'mobile-menu', sx: { width: 'min(86vw, 340px)', p: 3, bgcolor: colors.bg } } }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Logo />
          <IconButton aria-label="Close menu" onClick={close} sx={{ width: 44, height: 44 }}>
            <X size={24} />
          </IconButton>
        </Box>
        <Box component="nav" aria-label="Mobile" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {links.map((l) => (
            <Box key={l.label} component={linkComponent} to={l.to} onClick={close} sx={{ ...navLinkSx, fontSize: '1.0625rem', py: 1.5 }}>
              {l.label}
            </Box>
          ))}
        </Box>
        <Box sx={{ mt: 'auto', display: 'flex', flexDirection: 'column', gap: 1.5, pt: 4 }}>
          {signedIn && (
            <>
              <Button component={RouterLink} to={ROUTES.app} onClick={close} variant="contained" color="primary" size="large">
                Open app
              </Button>
              <Button onClick={handleLogout} variant="outlined" color="primary" size="large">
                Log out
              </Button>
            </>
          )}
          {!signedIn && !checking && (
            <>
              <Button component={RouterLink} to={ROUTES.signup} onClick={close} variant="contained" color="primary" size="large">
                Start Your Journey
              </Button>
              <Button component={RouterLink} to={ROUTES.login} onClick={close} variant="outlined" color="primary" size="large">
                Log in
              </Button>
            </>
          )}
        </Box>
      </Drawer>
    </AppBar>
  )
}
