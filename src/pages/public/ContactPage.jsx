import { Link as RouterLink } from 'react-router-dom'
import { Alert, Box, Card, CardContent, Container, Link, MenuItem, TextField, Typography } from '@mui/material'
import PageHeader from '../../components/common/PageHeader.jsx'
import SubmitButton from '../../components/auth/SubmitButton.jsx'
import TextInput from '../../components/auth/TextInput.jsx'
import { useForm } from '../../hooks/useForm.js'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { usePrototypeSubmit } from '../../hooks/usePrototypeSubmit.js'
import { ROUTES } from '../../constants/navigation.js'
import { SITE_CONFIG } from '../../constants/siteConfig.js'
import { contentWidths } from '../../theme/tokens.js'
import { validateEmail, validateRequired } from '../../utils/validation.js'

const TOPICS = ['Question about Arcloop', 'Report a problem', 'Privacy request', 'Something else']
const MESSAGE_MAX = 2000

const validate = ({ email, topic, message }) => ({
  email: validateEmail(email),
  topic: validateRequired(topic, 'Choose a topic.'),
  message: validateRequired(message, 'Write a short message.') || (message.length > MESSAGE_MAX ? `Keep it under ${MESSAGE_MAX} characters.` : undefined),
})

export default function ContactPage() {
  usePageMeta('Contact & support', 'How to get help with Arcloop.')
  const { status, submit } = usePrototypeSubmit()
  const { values, errors, onChange, onBlur, handleSubmit } = useForm({ initialValues: { email: '', topic: '', message: '' }, validate })

  return (
    <>
      <PageHeader eyebrow="Support" title="Contact & support" description="Questions, problems or feedback: we would like to hear from you." />
      <Container sx={{ maxWidth: `${contentWidths.page}px !important`, py: { xs: 5, md: 8 } }}>
        <Box sx={{ display: 'grid', gap: { xs: 5, md: 7 }, gridTemplateColumns: { xs: '1fr', md: '1fr 1.2fr' }, alignItems: 'start' }}>
          <Box>
            <Typography variant="h3" component="h2" sx={{ mb: 2 }}>
              Ways to reach us
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 1 }}>
              <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>Support email: </Box>
              {SITE_CONFIG.supportEmail || '[to be configured]'}
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              No support channel is set up yet, so please do not rely on this page for urgent help.
            </Typography>
            <Typography variant="h4" component="h3" sx={{ mb: 1 }}>
              Before you write
            </Typography>
            <Typography color="text.secondary">
              The <Link component={RouterLink} to={{ pathname: ROUTES.home, hash: '#faq' }}>FAQ</Link> answers common questions. For how we plan to handle personal information, see the{' '}
              <Link component={RouterLink} to={ROUTES.privacy}>draft Privacy Policy</Link>.
            </Typography>
          </Box>

          <Card>
            <CardContent sx={{ p: { xs: 3, md: 4 } }}>
              <Alert severity="info" variant="outlined" sx={{ mb: 3 }}>
                Layout preview: this form does not send messages yet.
              </Alert>
              <Box component="form" noValidate onSubmit={handleSubmit(submit)} sx={{ display: 'grid', gap: 2.5 }}>
                <TextInput name="email" label="Your email" type="email" autoComplete="email" value={values.email} onChange={onChange} onBlur={onBlur} error={errors.email} />
                <TextInput name="topic" label="Topic" select value={values.topic} onChange={onChange} error={errors.topic}>
                  {TOPICS.map((t) => (
                    <MenuItem key={t} value={t}>{t}</MenuItem>
                  ))}
                </TextInput>
                <TextInput
                  name="message"
                  label="Message"
                  multiline
                  minRows={5}
                  value={values.message}
                  onChange={onChange}
                  onBlur={onBlur}
                  error={errors.message}
                  helperText={`${values.message.length}/${MESSAGE_MAX}`}
                />
                <SubmitButton loading={status === 'loading'} loadingLabel="Sending…">Send message</SubmitButton>
                <div aria-live="polite">
                  {status === 'done' && (
                    <Alert severity="info" variant="outlined">
                      Not sent: messaging is not connected yet. Nothing was saved.
                    </Alert>
                  )}
                </div>
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Container>
    </>
  )
}
