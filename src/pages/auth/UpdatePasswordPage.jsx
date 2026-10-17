import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Link, Typography } from '@mui/material'
import { CircleCheck } from 'lucide-react'
import AuthLayout from '../../components/auth/AuthLayout.jsx'
import FormError from '../../components/auth/FormError.jsx'
import PageLoader from '../../components/common/PageLoader.jsx'
import PasswordField from '../../components/auth/PasswordField.jsx'
import SubmitButton from '../../components/auth/SubmitButton.jsx'
import { useAsyncSubmit } from '../../hooks/useAsyncSubmit.js'
import { useAuth } from '../../hooks/useAuth.js'
import { useForm } from '../../hooks/useForm.js'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { updatePassword } from '../../services/authService.js'
import { ROUTES } from '../../constants/navigation.js'
import { PASSWORD_MIN_LENGTH, validateNewPassword } from '../../utils/validation.js'
import { colors } from '../../theme/tokens.js'

const validate = ({ password, confirm }) => ({
  password: validateNewPassword(password),
  confirm: !confirm ? 'Re-enter your new password.' : confirm !== password ? 'The passwords do not match.' : undefined,
})

// Landing page for the password-reset email link. The Supabase client turns the
// link into a session; without one the link is invalid or expired.
export default function UpdatePasswordPage() {
  usePageMeta('Choose a new password')
  const { status: authStatus } = useAuth()
  const { status, error, submit } = useAsyncSubmit(updatePassword)
  const { values, errors, onChange, onBlur, handleSubmit } = useForm({ initialValues: { password: '', confirm: '' }, validate })

  if (authStatus === 'loading') return <PageLoader />

  if (authStatus !== 'authenticated') {
    return (
      <AuthLayout title="This link has expired">
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          This password reset link is invalid, has expired, or was already used. Reset links also need to be opened in
          the same browser where you asked for them.
        </Typography>
        <Button component={RouterLink} to={ROUTES.forgotPassword} variant="contained" color="primary" size="large" fullWidth>
          Request a new link
        </Button>
      </AuthLayout>
    )
  }

  if (status === 'success') {
    return (
      <AuthLayout title="Password updated">
        <Box role="status" sx={{ textAlign: 'center' }}>
          <Box sx={{ color: colors.success, mb: 2 }}>
            <CircleCheck size={48} aria-hidden="true" />
          </Box>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Your password has been changed. You are logged in on this device.
          </Typography>
          <Button component={RouterLink} to={ROUTES.app} variant="contained" color="primary" size="large">
            Continue
          </Button>
        </Box>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Pick something you have not used elsewhere."
      footer={
        <Typography variant="body2" color="text.secondary">
          <Link component={RouterLink} to={ROUTES.app}>Cancel</Link>
        </Typography>
      }
    >
      <Box component="form" noValidate onSubmit={handleSubmit(({ password }) => submit(password))} sx={{ display: 'grid', gap: 2.5 }}>
        <PasswordField label="New password" value={values.password} onChange={onChange} onBlur={onBlur} error={errors.password} autoComplete="new-password" helperText={`At least ${PASSWORD_MIN_LENGTH} characters.`} />
        <PasswordField name="confirm" label="Confirm new password" value={values.confirm} onChange={onChange} onBlur={onBlur} error={errors.confirm} autoComplete="new-password" />
        <FormError message={error} />
        <SubmitButton loading={status === 'loading'} loadingLabel="Saving…">
          Update password
        </SubmitButton>
      </Box>
    </AuthLayout>
  )
}
