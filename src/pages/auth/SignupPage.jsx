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
import { signUp } from '../../services/authService.js'
import { isBackendConfigured } from '../../services/backend.js'
import { ROUTES } from '../../constants/navigation.js'
import { PASSWORD_MIN_LENGTH, validateEmail, validateNewPassword } from '../../utils/validation.js'

const validate = ({ email, password, agree }) => ({
  email: validateEmail(email),
  password: validateNewPassword(password),
  agree: agree ? undefined : 'Please agree to continue.',
})

export default function SignupPage() {
  usePageMeta('Sign up')
  const { status, error, result, submit, reset } = useAsyncSubmit(signUp)
  const { values, errors, onChange, onBlur, handleSubmit } = useForm({ initialValues: { email: '', password: '', agree: false }, validate })

  // If the project has email confirmation switched off, a session already
  // exists and <GuestOnly> redirects away before this renders.
  if (status === 'success' && result?.needsConfirmation) {
    return (
      <AuthLayout title="Almost there">
        <CheckInboxPanel title="Check your inbox" onBack={reset} backLabel="Use a different email">
          If this email can be used to create an account, we have sent a confirmation link to it. Open the link to
          finish signing up. If nothing arrives in a few minutes, check your spam folder.
        </CheckInboxPanel>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Just an email and a password. You can set up your profile after."
      footer={
        <Typography variant="body2" color="text.secondary">
          Already have an account? <Link component={RouterLink} to={ROUTES.login}>Log in</Link>
        </Typography>
      }
    >
      <Box component="form" noValidate onSubmit={handleSubmit(({ email, password }) => submit({ email, password }))} sx={{ display: 'grid', gap: 2.5 }}>
        <TextInput name="email" label="Email" type="email" autoComplete="email" value={values.email} onChange={onChange} onBlur={onBlur} error={errors.email} />
        <PasswordField
          value={values.password}
          onChange={onChange}
          onBlur={onBlur}
          error={errors.password}
          autoComplete="new-password"
          helperText={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        />
        <FormControl error={Boolean(errors.agree)}>
          <FormControlLabel
            control={<Checkbox id="field-agree" name="agree" checked={values.agree} onChange={onChange} slotProps={{ input: { 'aria-describedby': errors.agree ? 'field-agree-help' : undefined } }} />}
            label={
              <Typography variant="body2">
                I agree to the <Link component={RouterLink} to={ROUTES.terms}>Terms</Link> and{' '}
                <Link component={RouterLink} to={ROUTES.privacy}>Privacy Policy</Link> (both are drafts).
              </Typography>
            }
          />
          {errors.agree && <FormHelperText id="field-agree-help">{errors.agree}</FormHelperText>}
        </FormControl>
        <FormError message={error} />
        <SubmitButton loading={status === 'loading'} loadingLabel="Creating account…" disabled={!isBackendConfigured}>
          Create account
        </SubmitButton>
      </Box>
    </AuthLayout>
  )
}
