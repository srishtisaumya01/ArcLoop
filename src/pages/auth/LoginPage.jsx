import { Link as RouterLink } from 'react-router-dom'
import { Box, Link, Typography } from '@mui/material'
import AuthLayout from '../../components/auth/AuthLayout.jsx'
import FormError from '../../components/auth/FormError.jsx'
import PasswordField from '../../components/auth/PasswordField.jsx'
import SubmitButton from '../../components/auth/SubmitButton.jsx'
import TextInput from '../../components/auth/TextInput.jsx'
import { useAsyncSubmit } from '../../hooks/useAsyncSubmit.js'
import { useForm } from '../../hooks/useForm.js'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { useI18n } from '../../hooks/useI18n.js'
import { signIn } from '../../services/authService.js'
import { isBackendConfigured } from '../../services/backend.js'
import { ROUTES } from '../../constants/navigation.js'
import { validateEmail, validateRequired } from '../../utils/validation.js'

const validate = ({ email, password }) => ({
  email: validateEmail(email),
  password: validateRequired(password, 'Enter your password.'),
})

export default function LoginPage() {
  const { t } = useI18n()
  usePageMeta(t('Log in'))
  // On success the auth listener updates the session and <GuestOnly> redirects.
  const { status, error, submit } = useAsyncSubmit(signIn)
  const { values, errors, onChange, onBlur, handleSubmit } = useForm({ initialValues: { email: '', password: '' }, validate })

  return (
    <AuthLayout
      title={t('Welcome back')}
      subtitle={t('Log in to pick up where you left off.')}
      footer={
        <Typography variant="body2" color="text.secondary">
          {t('New to Arcloop?')} <Link component={RouterLink} to={ROUTES.signup}>{t('Create an account')}</Link>
        </Typography>
      }
    >
      <Box component="form" noValidate onSubmit={handleSubmit(submit)} sx={{ display: 'grid', gap: 2.5 }}>
        <TextInput name="email" label={t('Email')} type="email" autoComplete="email" value={values.email} onChange={onChange} onBlur={onBlur} error={errors.email} />
        <PasswordField value={values.password} onChange={onChange} onBlur={onBlur} error={errors.password} autoComplete="current-password" />
        <Box sx={{ textAlign: 'right', mt: -1 }}>
          <Link component={RouterLink} to={ROUTES.forgotPassword} variant="body2" sx={{ display: 'inline-block', py: 1.25 }}>{t('Forgot your password?')}</Link>
        </Box>
        <FormError message={error} />
        <SubmitButton loading={status === 'loading' || status === 'success'} loadingLabel={t('Logging in…')} disabled={!isBackendConfigured}>
          {t('Log in')}
        </SubmitButton>
      </Box>
    </AuthLayout>
  )
}
