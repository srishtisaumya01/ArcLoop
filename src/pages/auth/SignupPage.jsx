import { Link as RouterLink } from 'react-router-dom'
import { Box, Checkbox, FormControl, FormControlLabel, FormHelperText, Link, Typography } from '@mui/material'
import AuthLayout from '../../components/auth/AuthLayout.jsx'
import CheckInboxPanel from '../../components/auth/CheckInboxPanel.jsx'
import FormError from '../../components/auth/FormError.jsx'
import PasswordField from '../../components/auth/PasswordField.jsx'
import SubmitButton from '../../components/auth/SubmitButton.jsx'
import TextInput from '../../components/auth/TextInput.jsx'
import { useAsyncSubmit } from '../../hooks/useAsyncSubmit.js'
import { useForm } from '../../hooks/useForm.js'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { useI18n } from '../../hooks/useI18n.js'
import { signUp } from '../../services/authService.js'
import { isBackendConfigured } from '../../services/backend.js'
import { ROUTES } from '../../constants/navigation.js'
import { PASSWORD_MIN_LENGTH, validateEmail, validateNewPassword, validateUsername } from '../../utils/validation.js'

const validate = ({ username, email, password, agree }) => ({
  username: validateUsername(username),
  email: validateEmail(email),
  password: validateNewPassword(password),
  agree: agree ? undefined : 'Please agree to continue.',
})

export default function SignupPage() {
  const { t, tx } = useI18n()
  usePageMeta(t('Sign up'))
  const { status, error, result, submit, reset } = useAsyncSubmit(signUp)
  const { values, errors, onChange, onBlur, handleSubmit } = useForm({ initialValues: { username: '', email: '', password: '', agree: false }, validate })

  // If the project has email confirmation switched off, a session already
  // exists and <GuestOnly> redirects away before this renders.
  if (status === 'success' && result?.needsConfirmation) {
    return (
      <AuthLayout title="Almost there">
        <CheckInboxPanel title={t('Check your inbox')} onBack={reset} backLabel={t('Use a different email')}>
          {t('If this email can be used to create an account, we have sent a confirmation link to it. Open the link to finish signing up. If nothing arrives in a few minutes, check your spam folder.')}
        </CheckInboxPanel>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={t('Create your account')}
      subtitle={t('A username, an email and a password. You can add a photo and more after.')}
      footer={
        <Typography variant="body2" color="text.secondary">
          {t('Already have an account?')} <Link component={RouterLink} to={ROUTES.login}>{t('Log in')}</Link>
        </Typography>
      }
    >
      <Box component="form" noValidate onSubmit={handleSubmit(({ username, email, password }) => submit({ username, email, password }))} sx={{ display: 'grid', gap: 2.5 }}>
        <TextInput name="username" label={t('Username')} autoComplete="username" autoCapitalize="none" spellCheck={false} value={values.username} onChange={onChange} onBlur={onBlur} error={errors.username} helperText={t('3 to 30 letters, numbers, dots or underscores.')} />
        <TextInput name="email" label={t('Email')} type="email" autoComplete="email" value={values.email} onChange={onChange} onBlur={onBlur} error={errors.email} />
        <PasswordField
          value={values.password}
          onChange={onChange}
          onBlur={onBlur}
          error={errors.password}
          autoComplete="new-password"
          helperText={t('At least {count} characters.', { count: PASSWORD_MIN_LENGTH })}
        />
        <FormControl error={Boolean(errors.agree)}>
          <FormControlLabel
            control={<Checkbox id="field-agree" name="agree" checked={values.agree} onChange={onChange} slotProps={{ input: { 'aria-describedby': errors.agree ? 'field-agree-help' : undefined } }} />}
            label={
              <Typography variant="body2">
                {tx('I agree to the {terms} and {privacy} (both are drafts).', {
                  terms: <Link component={RouterLink} to={ROUTES.terms}>{t('Terms')}</Link>,
                  privacy: <Link component={RouterLink} to={ROUTES.privacy}>{t('Privacy Policy')}</Link>,
                })}
              </Typography>
            }
          />
          {errors.agree && <FormHelperText id="field-agree-help">{t(errors.agree)}</FormHelperText>}
        </FormControl>
        <FormError message={error} />
        <SubmitButton loading={status === 'loading'} loadingLabel={t('Creating account…')} disabled={!isBackendConfigured}>
          {t('Create account')}
        </SubmitButton>
      </Box>
    </AuthLayout>
  )
}
