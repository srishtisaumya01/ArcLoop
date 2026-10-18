import { useCallback, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Container, Skeleton, Typography } from '@mui/material'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import PageHeader from '../../components/common/PageHeader.jsx'
import StatePanel from '../../components/common/StatePanel.jsx'
import { weekdaysSummary } from '../../components/planner/weekFormat.js'
import AttendanceSection from '../../components/settings/AttendanceSection.jsx'
import PrivacySection from '../../components/settings/PrivacySection.jsx'
import ProfileSection from '../../components/settings/ProfileSection.jsx'
import SettingsSection from '../../components/settings/SettingsSection.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useAuth } from '../../hooks/useAuth.js'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { getMyProfile } from '../../services/profileService.js'
import DeleteAccount from '../../components/settings/DeleteAccount.jsx'
import { reminderService } from '../../services/reminders/index.js'
import { ROUTES } from '../../constants/navigation.js'
import { contentWidths } from '../../theme/tokens.js'

// Settings: the one place for the account's profile, privacy and links to reminders and password.
// The profile row is loaded once and every section edits it through the profile service, so what is
// shown is always what the database returned. Reminder controls stay on their own page (no copy
// here); password changes use the existing reset flow.
export default function SettingsPage() {
  usePageMeta('Settings')
  const { user } = useAuth()
  const load = useCallback(async () => {
    const [profile, reminders] = await Promise.all([getMyProfile(user.id), reminderService.getPreferences().catch(() => null)])
    return { profile, reminders }
  }, [user.id])
  const { status, data, retry } = useAsync(load)
  const [saved, setSaved] = useState(null)
  const profile = saved ?? data?.profile
  const reminders = data?.reminders

  return (
    <>
      <PageHeader eyebrow="Settings" title="Settings" description="Your profile, privacy and reminders. Changes are saved only when you choose Save." />
      <Container sx={{ maxWidth: `${contentWidths.page}px !important`, py: { xs: 4, md: 6 }, display: 'grid', gap: 3 }}>
        {status === 'loading' && (
          <Box aria-busy="true" aria-label="Loading your settings" sx={{ display: 'grid', gap: 2 }}>
            <Skeleton variant="rounded" height={260} />
            <Skeleton variant="rounded" height={180} />
          </Box>
        )}
        {status === 'error' && (
          <StatePanel tone="error" icon={TriangleAlert} title="We couldn’t load your settings" text="Something went wrong while loading. Please try again."
            action={<Button variant="contained" startIcon={<RefreshCw size={18} aria-hidden="true" />} onClick={retry}>Try again</Button>} />
        )}
        {status === 'success' && !profile && <StatePanel title="No profile found" text="Your profile has not been created yet. Try logging out and back in." />}
        {status === 'success' && profile && (
          <>
            <ProfileSection profile={profile} userId={user.id} onSaved={setSaved} />
            <PrivacySection profile={profile} userId={user.id} onSaved={setSaved} />
            <SettingsSection title="Reminders" description="Gentle nudges, only when you want them.">
              <Typography>
                {reminders?.enabled ? `Reminders are on: ${reminders.remindTime}, ${weekdaysSummary(reminders.weekdays)}` : 'Reminders are off'}
              </Typography>
              <Box>
                <Button component={RouterLink} to={ROUTES.reminders} variant="outlined" size="small">Manage reminders</Button>
              </Box>
            </SettingsSection>
            <AttendanceSection />
            <SettingsSection title="Account">
              <Box>
                <Typography variant="body2" color="text.secondary">Email</Typography>
                <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{user.email}</Typography>
              </Box>
              <Box>
                <Button component={RouterLink} to={ROUTES.updatePassword} variant="outlined" size="small">Change password</Button>
              </Box>
              <DeleteAccount />
            </SettingsSection>
          </>
        )}
      </Container>
    </>
  )
}
