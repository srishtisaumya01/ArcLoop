import { Alert, Box, Container, Typography } from '@mui/material'
import { LogoMark } from '../ui/Logo.jsx'
import { isBackendConfigured } from '../../services/backend.js'
import { colors, contentWidths, gradients, navOuterHeight, radii } from '../../theme/tokens.js'

// Two-column auth shell: brand panel (md+) and the form card, on the brand gradient that runs up behind the navbar.
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <Box
      sx={{
        background: gradients.brand,
        mt: `-${navOuterHeight}px`,
        pt: { xs: `${navOuterHeight + 24}px`, md: `${navOuterHeight + 56}px` },
        pb: { xs: 6, md: 10 },
      }}
    >
      <Container sx={{ maxWidth: `${contentWidths.page}px !important` }}>
        <Box sx={{ display: 'grid', gap: { xs: 3, md: 0 }, gridTemplateColumns: { xs: '1fr', md: '1fr 1.1fr' }, maxWidth: 1040, mx: 'auto', borderRadius: `${radii.lg}px`, overflow: 'hidden', boxShadow: '0 30px 80px rgba(6, 18, 43, 0.35)', bgcolor: colors.surface, border: '1px solid rgba(255, 255, 255, 0.4)' }}>
          <Box sx={{ position: 'relative', overflow: 'hidden', display: { xs: 'none', md: 'flex' }, flexDirection: 'column', justifyContent: 'space-between', p: 6, background: gradients.brandVertical, color: colors.textOnDark }}>
            <Box aria-hidden="true" sx={{ position: 'absolute', right: -140, bottom: -160, width: 360, height: 360, borderRadius: '50%', border: '56px solid rgba(255, 255, 255, 0.1)', pointerEvents: 'none' }} />
            <LogoMark size={44} ringColor={colors.textOnDark} arrowColor={colors.mint300} />
            <Box sx={{ position: 'relative' }}>
              <Typography variant="h3" component="p" sx={{ mb: 2 }}>
                Consistency over perfection.
              </Typography>
              <Typography sx={{ color: 'rgba(255, 255, 255, 0.82)' }}>
                Build habits at your own pace, and share only what you choose to share.
              </Typography>
            </Box>
          </Box>

          <Box sx={{ p: { xs: 3, sm: 5, md: 6 } }}>
            {!isBackendConfigured && (
              <Alert severity="warning" variant="outlined" sx={{ mb: 3 }}>
                Accounts are not available right now.
                {import.meta.env.DEV && (
                  <>
                    {' '}
                    Developer note: the API address is not configured. Set <code>VITE_API_BASE_URL</code> in <code>.env</code> (see the
                    README, "Backend (Django)"), then restart the dev server.
                  </>
                )}
              </Alert>
            )}
            <Typography variant="h2" component="h1" sx={{ fontSize: { xs: '1.75rem', md: '2rem' }, mb: 1 }}>
              {title}
            </Typography>
            {subtitle && (
              <Typography color="text.secondary" sx={{ mb: 3 }}>
                {subtitle}
              </Typography>
            )}
            {children}
            {footer && <Box sx={{ mt: 3, textAlign: 'center' }}>{footer}</Box>}
          </Box>
        </Box>
      </Container>
    </Box>
  )
}
