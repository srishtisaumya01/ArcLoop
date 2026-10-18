import { useEffect, useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
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

// useAsyncSubmit passes one value, so the password and its options travel together.
const changePassword = ({ password, options }) => updatePassword(password, options)

const validate = ({ password, confirm, currentPassword, needsCurrent }) => ({
  currentPassword: needsCurrent && !currentPassword ? 'Enter your current password.' : undefined,
  password: validateNewPassword(password),
  confirm: !confirm ? 'Re-enter your new password.' : confirm !== password ? 'The passwords do not match.' : undefined,
})

// Landing page for the password-reset email link, and the "change password" page for signed-in users.
// The emailed link carries `uid` and `token`, which are sent with the new password (it works in any browser and
// only once); a signed-in user without a link must give their current password instead.
export default function UpdatePasswordPage() {
  usePageMeta('Choose a new password')
  const { status: authStatus } = useAuth()
  const [params, setParams] = useSearchParams()
  // The link's secret is kept in memory and removed from the address bar at once, so it does not linger in the URL,
  // the browser history or a shared screenshot. (Reloading the page therefore needs the emailed link again.)
  const [reset] = useState(() => (params.get('uid') && params.get('token') ? { uid: params.get('uid'), token: params.get('token') } : null))
  useEffect(() => {
    if (params.has('uid') || params.has('token')) {
      setParams((current) => {
        current.delete('uid')
        current.delete('token')
        return current
      }, { replace: true })
    }
  }, [params, setParams])
  const needsCurrent = !reset
  const { status, error, submit } = useAsyncSubmit(changePassword)
  const { values, errors, onChange, onBlur, handleSubmit } = useForm({ initialValues: { password: '', confirm: '', currentPassword: '' }, validate: (v) => validate({ ...v, needsCurrent }) })

  if (authStatus === 'loading') return <PageLoader />

  if (authStatus !== 'authenticated' && !reset) {
    return (
      <AuthLayout title="This link has expired">
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          This password reset link is invalid, has expired (links last one hour), or was already used. Request a new one and
          open it within the hour.
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
            {reset ? 'Your password has been changed. Log in with it to continue.' : 'Your password has been changed. You are logged in on this device.'}
          </Typography>
          <Button component={RouterLink} to={reset ? ROUTES.login : ROUTES.app} variant="contained" color="primary" size="large">
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
      <Box component="form" noValidate onSubmit={handleSubmit(({ password, currentPassword }) => submit({ password, options: reset ? { reset } : { currentPassword } }))} sx={{ display: 'grid', gap: 2.5 }}>
        {needsCurrent && (
          <PasswordField name="currentPassword" label="Current password" value={values.currentPassword} onChange={onChange} onBlur={onBlur} error={errors.currentPassword} autoComplete="current-password" />
        )}
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
