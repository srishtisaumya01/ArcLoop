import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Alert, Box, Button, Card, CardContent, Container, Link, MenuItem, Typography } from '@mui/material'
import { Mail } from 'lucide-react'
import PageHeader from '../../components/common/PageHeader.jsx'
import SubmitButton from '../../components/auth/SubmitButton.jsx'
import TextInput from '../../components/auth/TextInput.jsx'
import Reveal from '../../components/ui/Reveal.jsx'
import { useForm } from '../../hooks/useForm.js'
import { useI18n } from '../../hooks/useI18n.js'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { ROUTES } from '../../constants/navigation.js'
import { SITE_CONFIG } from '../../constants/siteConfig.js'
import { colors, contentWidths, gradients, radii, shadows } from '../../theme/tokens.js'
import { buildMailto } from '../../utils/mailto.js'
import { validateEmail, validateRequired } from '../../utils/validation.js'

const TOPICS = ['Question about Arcloop', 'Report a problem', 'Privacy request', 'Something else']
const MESSAGE_MAX = 2000

const validate = ({ email, topic, message }) => ({
  email: validateEmail(email),
  topic: validateRequired(topic, 'Choose a topic.'),
  message: validateRequired(message, 'Write a short message.') || (message.length > MESSAGE_MAX ? `Keep it under ${MESSAGE_MAX} characters.` : undefined),
})

export default function ContactPage() {
  const { t, tx } = useI18n()
  usePageMeta(t('Contact & support'), t('How to get help with Arcloop.'))
  const [mailto, setMailto] = useState('')
  const { values, errors, onChange, onBlur, handleSubmit } = useForm({ initialValues: { email: '', topic: '', message: '' }, validate })
  const email = SITE_CONFIG.supportEmail

  const submit = (v) => {
    const url = buildMailto(v)
    setMailto(url)
    window.location.assign(url)
  }

  return (
    <>
      <PageHeader eyebrow={t('Support')} title={t('Contact & support')} description={t('Questions, problems or feedback: we would like to hear from you.')} />
      <Container sx={{ maxWidth: `${contentWidths.page}px !important`, py: { xs: 5, md: 8 } }}>
        <Box sx={{ display: 'grid', gap: { xs: 5, md: 7 }, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1.2fr)' }, alignItems: 'start' }}>
          <Reveal>
            <Typography variant="h3" component="h2" sx={{ mb: 2 }}>
              {t('Ways to reach us')}
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', p: 2.5, mb: 2, borderRadius: `${radii.lg}px`, background: gradients.brand, color: colors.textOnDark, boxShadow: shadows.md }}>
              <Box sx={{ width: 48, height: 48, flexShrink: 0, borderRadius: '14px', display: 'grid', placeItems: 'center', bgcolor: 'rgba(255, 255, 255, 0.16)' }}>
                <Mail size={24} aria-hidden="true" />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                  {t('Support email')}
                </Typography>
                <Link href={`mailto:${email}`} sx={{ color: colors.textOnDark, fontWeight: 800, fontSize: '1.0625rem', overflowWrap: 'anywhere', textDecorationColor: 'currentColor', '&:hover': { color: colors.mint300 } }}>
                  {email}
                </Link>
              </Box>
            </Box>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              {t('Email is our only support channel for now, so there is no phone or chat support.')}
            </Typography>
            <Typography variant="h4" component="h3" sx={{ mb: 1 }}>
              {t('Before you write')}
            </Typography>
            <Typography color="text.secondary">
              {tx('The {faq} answers common questions. For how we plan to handle personal information, see the {privacy}.', {
                faq: <Link component={RouterLink} to={ROUTES.faq}>{t('FAQ')}</Link>,
                privacy: <Link component={RouterLink} to={ROUTES.privacy}>{t('draft Privacy Policy')}</Link>,
              })}
            </Typography>
          </Reveal>

          <Reveal delay={120}>
            <Card>
              <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                <Alert severity="info" variant="outlined" sx={{ mb: 3 }}>
                  {t('This form prepares an email in your email app, addressed to {email}. Nothing is sent until you press send there.', { email })}
                </Alert>
                <Box component="form" noValidate onSubmit={handleSubmit(submit)} sx={{ display: 'grid', gap: 2.5 }}>
                  <TextInput name="email" label={t('Your email')} type="email" autoComplete="email" value={values.email} onChange={onChange} onBlur={onBlur} error={errors.email} />
                  <TextInput name="topic" label={t('Topic')} select value={values.topic} onChange={onChange} error={errors.topic}>
                    {TOPICS.map((topic) => (
                      <MenuItem key={topic} value={topic}>{t(topic)}</MenuItem>
                    ))}
                  </TextInput>
                  <TextInput
                    name="message"
                    label={t('Message')}
                    multiline
                    minRows={5}
                    value={values.message}
                    onChange={onChange}
                    onBlur={onBlur}
                    error={errors.message}
                    helperText={`${values.message.length}/${MESSAGE_MAX}`}
                  />
                  <SubmitButton loading={false} loadingLabel="">{t('Send message')}</SubmitButton>
                  <div aria-live="polite">
                    {mailto && (
                      <Alert severity="info" variant="outlined" action={<Button color="inherit" size="small" href={mailto}>{t('Open email again')}</Button>}>
                        {t('Your email app should open with your message ready. It has not been sent yet: press send there. If nothing opens, write to {email}.', { email })}
                      </Alert>
                    )}
                  </div>
                </Box>
              </CardContent>
            </Card>
          </Reveal>
        </Box>
      </Container>
    </>
  )
}
