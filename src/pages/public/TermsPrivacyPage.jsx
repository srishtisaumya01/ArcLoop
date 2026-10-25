import { Link as RouterLink } from 'react-router-dom'
import { Box, Container, Link, Typography } from '@mui/material'
import PageHeader from '../../components/common/PageHeader.jsx'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { useI18n } from '../../hooks/useI18n.js'
import { ROUTES } from '../../constants/navigation.js'
import { colors, contentWidths, radii } from '../../theme/tokens.js'

// Terms and privacy together, in plain words. Short sections, no legal jargon.
const SECTIONS = [
  ['What Arcloop is', ['Arcloop helps you plan your day, join challenges, mark your attendance and keep a streak going. You can use it alone or with friends.']],
  ['Your account', ['You sign up with a username, an email and a password. Keep your password to yourself, and use one account for one person.', 'You can change your username, email, password and photo any time from your Profile, or delete your account there.']],
  ['What we keep', ['Your username, email, name, timezone and profile photo (if you add one).', 'Your plans, tasks, challenges, the days you marked attendance and your reminders.', 'Your password is stored scrambled, so nobody at Arcloop can read it.']],
  ['Emails we send', ['A code when you reset your password.', 'A reminder at 5 pm and 10 pm if you are in a challenge and have not marked attendance that day. Every reminder has a link to stop them.']],
  ['Who can see what', ['Your plans and progress are private. Friends you add to a group can see your username in that group.', 'We do not sell your data and we do not show ads.']],
  ['Using Arcloop fairly', ['Be kind to others, and do not try to break the app or use someone else’s account. We may close an account that does.']],
  ['Deleting your data', ['When you delete your account, your profile, plans, challenges and reminders are removed for good.']],
]

export default function TermsPrivacyPage() {
  const { t } = useI18n()
  usePageMeta(t('Terms & Privacy'), t('The rules of using Arcloop and how we look after your information, in plain words.'))
  return (
    <>
      <PageHeader eyebrow={t('Terms & Privacy')} title={t('Terms & Privacy')} description={t('The short version, in plain words.')} />
      <Container sx={{ maxWidth: `${contentWidths.narrow}px !important`, py: { xs: 5, md: 8 }, display: 'grid', gap: 3 }}>
        {SECTIONS.map(([title, paragraphs]) => (
          <Box key={title} component="section" sx={{ p: { xs: 2.5, md: 3 }, borderRadius: `${radii.lg}px`, border: `1px solid ${colors.border}`, bgcolor: colors.surface }}>
            <Typography variant="h3" component="h2" sx={{ mb: 1.25 }}>{t(title)}</Typography>
            <Box sx={{ display: 'grid', gap: 1 }}>
              {paragraphs.map((p) => <Typography key={p} color="text.secondary">{t(p)}</Typography>)}
            </Box>
          </Box>
        ))}
        <Typography color="text.secondary">
          {t('Questions? Write to us on the')} <Link component={RouterLink} to={ROUTES.contact}>{t('contact page')}</Link>. {t('Updated October 2026.')}
        </Typography>
      </Container>
    </>
  )
}
