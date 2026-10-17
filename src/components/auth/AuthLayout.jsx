import { Alert, Box, Container, Typography } from '@mui/material'
import { LogoMark } from '../ui/Logo.jsx'
import { isSupabaseConfigured } from '../../services/supabaseClient.js'
import { colors, contentWidths, gradients, radii, shadows } from '../../theme/tokens.js'

// Two-column auth shell: brand panel (md+) and the form card.
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <Box sx={{ background: gradients.hero, py: { xs: 4, md: 8 } }}>
      <Container sx={{ maxWidth: `${contentWidths.page}px !important` }}>
        <Box sx={{ display: 'grid', gap: { xs: 3, md: 0 }, gridTemplateColumns: { xs: '1fr', md: '1fr 1.1fr' }, maxWidth: 1040, mx: 'auto', borderRadius: `${radii.lg}px`, overflow: 'hidden', boxShadow: shadows.lg, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
          <Box sx={{ display: { xs: 'none', md: 'flex' }, flexDirection: 'column', justifyContent: 'space-between', p: 6, bgcolor: colors.navy900, color: colors.textOnDark, backgroundImage: `radial-gradient(500px 300px at 0% 100%, ${colors.navy700}, transparent 70%)` }}>
            <LogoMark size={44} ringColor={colors.ice400} arrowColor={colors.ice400} />
            <Box>
              <Typography variant="h3" component="p" sx={{ mb: 2 }}>
                Consistency over perfection.
              </Typography>
              <Typography sx={{ color: colors.textOnDarkMuted }}>
                Build habits at your own pace, and share only what you choose to share.
              </Typography>
            </Box>
          </Box>

          <Box sx={{ p: { xs: 3, sm: 5, md: 6 } }}>
            {!isSupabaseConfigured && (
              <Alert severity="warning" variant="outlined" sx={{ mb: 3 }}>
                Accounts are not available right now.
                {import.meta.env.DEV && (
                  <>
                    {' '}
                    Developer note: Supabase is not configured. Copy <code>.env.example</code> to <code>.env</code> and set
                    the project URL and anon key (see <code>docs/SUPABASE_SETUP.md</code>), then restart the dev server.
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
