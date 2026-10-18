import { Link as RouterLink } from 'react-router-dom'
import { Alert, Box, Button, Card, CardContent, Skeleton, Typography } from '@mui/material'
import Reveal from '../ui/Reveal.jsx'
import { useAppShell } from '../../hooks/useAppShell.js'
import { useAuth } from '../../hooks/useAuth.js'
import { useI18n } from '../../hooks/useI18n.js'
import { ROUTES } from '../../constants/navigation.js'

// The account details this screen used to be: email, name, timezone and privacy, with the way to change the password.
export default function AccountCard() {
  const { t } = useI18n()
  const { user } = useAuth()
  const { profile, profileStatus, reloadProfile } = useAppShell()
  const rows = [
    [t('Username'), profile?.username],
    [t('Email'), user.email],
    [t('Display name'), profile?.display_name || t('Not set yet')],
    [t('Timezone'), profile?.timezone],
    [t('Profile visibility'), profile?.profile_visibility],
    [t('Progress visibility'), profile?.progress_visibility],
  ].filter(([, value]) => value)

  return (
    <Reveal delay={80}>
      <Card>
        <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
          <Typography variant="h4" component="h2" sx={{ mb: 2 }}>
            {t('Your account')}
          </Typography>
          {profileStatus === 'loading' ? (
            <Skeleton variant="rounded" height={96} />
          ) : profileStatus === 'error' ? (
            <Alert severity="error" action={<Button color="inherit" size="small" onClick={reloadProfile}>{t('Try again')}</Button>}>
              {t('We couldn’t load your profile.')}
            </Alert>
          ) : (
            <Box component="dl" sx={{ m: 0, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}>
              {rows.map(([label, value]) => (
                <Box key={label}>
                  <Typography component="dt" variant="body2" color="text.secondary">
                    {label}
                  </Typography>
                  <Typography component="dd" sx={{ m: 0, fontWeight: 600, overflowWrap: 'anywhere', textTransform: label === t('Profile visibility') || label === t('Progress visibility') ? 'capitalize' : 'none' }}>
                    {value}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mt: 3 }}>
            <Button component={RouterLink} to={ROUTES.profile} variant="contained" color="primary" size="small">
              {t('Edit profile')}
            </Button>
            <Button component={RouterLink} to={ROUTES.settings} variant="outlined" color="primary" size="small">
              {t('Settings')}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Reveal>
  )
}
