import { useCallback } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Card, CardContent, Container, Skeleton, Typography } from '@mui/material'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import PageHeader from '../../components/common/PageHeader.jsx'
import StatePanel from '../../components/common/StatePanel.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useAuth } from '../../hooks/useAuth.js'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { getMyProfile } from '../../services/profileService.js'
import { ROUTES } from '../../constants/navigation.js'
import { contentWidths } from '../../theme/tokens.js'

// Minimal signed-in home. It proves the session -> database (RLS) path end to
// end; the real dashboard, habits and onboarding arrive in later phases.
export default function AppHomePage() {
  usePageMeta('Your account')
  const { user } = useAuth()
  const load = useCallback(() => getMyProfile(user.id), [user.id])
  const { status, data: profile, retry } = useAsync(load)

  return (
    <>
      <PageHeader
        eyebrow="Signed in"
        title={profile?.display_name ? `Welcome, ${profile.display_name}` : 'Welcome to Arcloop'}
        description="Your account is ready. Habits, check-ins and your dashboard are still being built."
      />
      <Container sx={{ maxWidth: `${contentWidths.page}px !important`, py: { xs: 5, md: 8 } }}>
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, alignItems: 'start' }}>
          <Card>
            <CardContent sx={{ p: 3.5 }}>
              <Typography variant="h3" component="h2" sx={{ mb: 2 }}>
                Account
              </Typography>
              <Typography variant="body2" color="text.secondary">Email</Typography>
              <Typography sx={{ fontWeight: 600, mb: 3, overflowWrap: 'anywhere' }}>{user.email}</Typography>
              <Button component={RouterLink} to={ROUTES.updatePassword} variant="outlined" color="primary" size="small">
                Change password
              </Button>
              <Button component={RouterLink} to={ROUTES.week} variant="contained" color="primary" size="small" sx={{ ml: 1.5 }}>
                Your week
              </Button>
              <Button component={RouterLink} to={ROUTES.day} variant="contained" color="primary" size="small" sx={{ ml: 1.5 }}>
                My Day
              </Button>
              <Button component={RouterLink} to={ROUTES.reminders} variant="outlined" color="primary" size="small" sx={{ ml: 1.5 }}>
                Reminders
              </Button>
              <Button component={RouterLink} to={ROUTES.progress} variant="outlined" color="primary" size="small" sx={{ ml: 1.5 }}>
                Progress
              </Button>
            </CardContent>
          </Card>

          <Box>
            {status === 'loading' && <Skeleton variant="rounded" height={220} sx={{ borderRadius: 4 }} />}
            {status === 'error' && (
              <StatePanel
                tone="error"
                icon={TriangleAlert}
                title="We couldn’t load your profile"
                text="Something went wrong while loading. Please try again."
                action={
                  <Button variant="contained" color="primary" startIcon={<RefreshCw size={18} aria-hidden="true" />} onClick={retry}>
                    Try again
                  </Button>
                }
              />
            )}
            {status === 'success' && !profile && (
              <StatePanel title="No profile found" text="Your profile has not been created yet. Try logging out and back in." />
            )}
            {status === 'success' && profile && (
              <Card>
                <CardContent sx={{ p: 3.5 }}>
                  <Typography variant="h3" component="h2" sx={{ mb: 2 }}>
                    Profile
                  </Typography>
                  <Box component="dl" sx={{ m: 0, display: 'grid', gap: 2 }}>
                    {[
                      ['Display name', profile.display_name || 'Not set yet'],
                      ['Timezone', profile.timezone],
                      ['Profile visibility', profile.profile_visibility],
                      ['Progress visibility', profile.progress_visibility],
                    ].map(([label, value]) => (
                      <Box key={label}>
                        <Typography component="dt" variant="body2" color="text.secondary">{label}</Typography>
                        <Typography component="dd" sx={{ m: 0, fontWeight: 600, textTransform: label.includes('visibility') ? 'capitalize' : 'none' }}>{value}</Typography>
                      </Box>
                    ))}
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
                    New profiles start private.
                  </Typography>
                  <Button component={RouterLink} to={ROUTES.settings} variant="outlined" color="primary" size="small" sx={{ mt: 2 }}>
                    Settings
                  </Button>
                </CardContent>
              </Card>
            )}
          </Box>
        </Box>
      </Container>
    </>
  )
}
