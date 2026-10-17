import { Link as RouterLink } from 'react-router-dom'
import { Box, Link, Typography } from '@mui/material'
import AuthLayout from '../../components/auth/AuthLayout.jsx'
import CheckInboxPanel from '../../components/auth/CheckInboxPanel.jsx'
import FormError from '../../components/auth/FormError.jsx'
import SubmitButton from '../../components/auth/SubmitButton.jsx'
import TextInput from '../../components/auth/TextInput.jsx'
import { useAsyncSubmit } from '../../hooks/useAsyncSubmit.js'
import { useForm } from '../../hooks/useForm.js'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { requestPasswordReset } from '../../services/authService.js'
import { isSupabaseConfigured } from '../../services/supabaseClient.js'
import { ROUTES } from '../../constants/navigation.js'
import { validateEmail } from '../../utils/validation.js'

const validate = ({ email }) => ({ email: validateEmail(email) })

export default function ForgotPasswordPage() {
  usePageMeta('Reset your password')
  const { status, error, submit, reset } = useAsyncSubmit(requestPasswordReset)
  const { values, errors, onChange, onBlur, handleSubmit } = useForm({ initialValues: { email: '' }, validate })

  const backToLogin = (
    <Typography variant="body2" color="text.secondary">
      Remembered it? <Link component={RouterLink} to={ROUTES.login}>Back to log in</Link>
    </Typography>
  )

  if (status === 'success') {
    return (
      <AuthLayout title="Reset your password" footer={backToLogin}>
        <CheckInboxPanel title="Check your inbox" onBack={reset} backLabel="Use a different email">
          If an account exists for that email, we have sent a link to choose a new password. The link works in the
          browser you requested it from.
        </CheckInboxPanel>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Reset your password" subtitle="Enter your email and we will send you a link to choose a new password." footer={backToLogin}>
      <Box component="form" noValidate onSubmit={handleSubmit(({ email }) => submit(email))} sx={{ display: 'grid', gap: 2.5 }}>
        <TextInput name="email" label="Email" type="email" autoComplete="email" value={values.email} onChange={onChange} onBlur={onBlur} error={errors.email} />
        <FormError message={error} />
        <SubmitButton loading={status === 'loading'} loadingLabel="Sending…" disabled={!isSupabaseConfigured}>
          Send reset link
        </SubmitButton>
      </Box>
    </AuthLayout>
  )
}
