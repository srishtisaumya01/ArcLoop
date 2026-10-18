import { Box, Container, Skeleton } from '@mui/material'
import { EmailSection, PasswordSection, PhotoSection, UsernameSection } from '../../components/account/AccountSections.jsx'
import PageHeader from '../../components/common/PageHeader.jsx'
import DeleteAccount from '../../components/settings/DeleteAccount.jsx'
import SettingsSection from '../../components/settings/SettingsSection.jsx'
import { useAppShell } from '../../hooks/useAppShell.js'
import { useI18n } from '../../hooks/useI18n.js'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { contentWidths } from '../../theme/tokens.js'

// Everything about the person's own account in one place: photo, username, email, password and deleting the account.
// (Name, timezone, privacy and reminders stay in Settings.)
export default function ProfilePage() {
  const { t } = useI18n()
  usePageMeta(t('Profile'))
  const { profile, displayName } = useAppShell()

  return (
    <>
      <PageHeader eyebrow={t('Profile')} title={t('Your profile')} description={t('Your photo, username, email and password. Changes are saved when you press the button in each box.')} />
      <Container sx={{ maxWidth: `${Math.min(contentWidths.page, 820)}px !important`, py: { xs: 4, md: 6 }, display: 'grid', gap: 3 }}>
        {!profile ? (
          <Box aria-busy="true" sx={{ display: 'grid', gap: 2 }}>
            <Skeleton variant="rounded" height={180} />
            <Skeleton variant="rounded" height={220} />
          </Box>
        ) : (
          <>
            <PhotoSection profile={profile} name={displayName} />
            <UsernameSection key={profile.username} profile={profile} />
            <EmailSection />
            <PasswordSection />
            <SettingsSection title={t('Delete account')}>
              <DeleteAccount />
            </SettingsSection>
          </>
        )}
      </Container>
    </>
  )
}
