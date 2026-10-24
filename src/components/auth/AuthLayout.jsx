import { Alert, Box, Container, Typography } from '@mui/material'
import { CalendarCheck, Flame, Users } from 'lucide-react'
import Logo from '../ui/Logo.jsx'
import { isBackendConfigured } from '../../services/backend.js'
import { useI18n } from '../../hooks/useI18n.js'
import { colors, contentWidths, gradients, navOuterHeight, radii } from '../../theme/tokens.js'

// Two-column auth shell: brand panel (md+) and the form card, on the brand gradient that runs up behind the navbar.
export default function AuthLayout({ title, subtitle, children, footer }) {
  const { t } = useI18n()
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
          <Box sx={{ position: 'relative', overflow: 'hidden', display: { xs: 'none', md: 'flex' }, flexDirection: 'column', justifyContent: 'flex-start', gap: 5, p: 6, background: gradients.brandVertical, color: colors.textOnDark }}>
            <Box aria-hidden="true" sx={{ position: 'absolute', right: -140, bottom: -160, width: 360, height: 360, borderRadius: '50%', border: '56px solid rgba(255, 255, 255, 0.1)', pointerEvents: 'none' }} />
            <Logo onDark size={52} />
            <Box sx={{ position: 'relative' }}>
              <Typography variant="h3" component="p" sx={{ mb: 2 }}>
                {t('Consistency over perfection.')}
              </Typography>
              <Typography sx={{ color: 'rgba(255, 255, 255, 0.82)' }}>
                {t('Build habits at your own pace, and share only what you choose to share.')}
              </Typography>
            </Box>
            <Box component="ul" sx={{ position: 'relative', listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}>
              {[
                [CalendarCheck, 'Mark attendance in your challenges', 'One tick a day, on the day. Nothing to catch up on.'],
                [Flame, 'Streaks that stay kind', 'Doing just one challenge a day keeps your streak alive.'],
                [Users, 'Solo or with friends', 'Join a challenge on your own or bring your people along.'],
              ].map(([Icon, title, text]) => (
                <Box component="li" key={title} sx={{ display: 'flex', gap: 1.75, alignItems: 'flex-start', p: 1.75, borderRadius: '14px', bgcolor: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.16)' }}>
                  <Box aria-hidden="true" sx={{ width: 36, height: 36, flexShrink: 0, borderRadius: '10px', display: 'grid', placeItems: 'center', bgcolor: 'rgba(124, 240, 192, 0.2)', color: colors.mint300 }}>
                    <Icon size={20} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontWeight: 700, lineHeight: 1.3 }}>{t(title)}</Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.78)' }}>{t(text)}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>

          <Box sx={{ p: { xs: 3, sm: 5, md: 6 } }}>
            <Box sx={{ display: { xs: 'flex', md: 'none' }, mb: 3 }}>
              <Logo size={40} />
            </Box>
            {!isBackendConfigured && (
              <Alert severity="warning" variant="outlined" sx={{ mb: 3 }}>
                {t('Accounts are not available right now.')}
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
              {t(title)}
            </Typography>
            {subtitle && (
              <Typography color="text.secondary" sx={{ mb: 3 }}>
                {t(subtitle)}
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
