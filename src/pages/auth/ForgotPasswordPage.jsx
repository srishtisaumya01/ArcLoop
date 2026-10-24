import { useEffect, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { Box, Button, Link, TextField, Typography } from '@mui/material'
import AuthLayout from '../../components/auth/AuthLayout.jsx'
import FormError from '../../components/auth/FormError.jsx'
import PasswordField from '../../components/auth/PasswordField.jsx'
import SubmitButton from '../../components/auth/SubmitButton.jsx'
import TextInput from '../../components/auth/TextInput.jsx'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { useI18n } from '../../hooks/useI18n.js'
import { requestResetCode, signIn, updatePassword, verifyResetCode } from '../../services/authService.js'
import { isBackendConfigured } from '../../services/backend.js'
import { ROUTES } from '../../constants/navigation.js'
import { PASSWORD_MIN_LENGTH, validateEmail, validateNewPassword } from '../../utils/validation.js'

const RESEND_SECONDS = 45

// Reset a forgotten password in three steps: your email, the six-digit code we send to it, then a new password. Once the new
// password is saved, you are logged in.
export default function ForgotPasswordPage() {
  const { t } = useI18n()
  usePageMeta(t('Reset your password'))
  const navigate = useNavigate()
  const [step, setStep] = useState('email') // 'email' | 'code' | 'password'
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [pass, setPass] = useState(null) // { uid, token } once the code is right
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [fieldError, setFieldError] = useState(null)
  const [state, setState] = useState({ busy: false, error: null, note: null })
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const id = setTimeout(() => setCooldown((n) => n - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  const run = async (work) => {
    setState({ busy: true, error: null, note: null })
    try {
      await work()
      setState((s) => ({ ...s, busy: false }))
    } catch (error) {
      setState({ busy: false, error: error?.message || t('Something went wrong. Please try again.'), note: null })
    }
  }

  const sendCode = (event) => {
    event?.preventDefault()
    const problem = validateEmail(email)
    setFieldError(problem ?? null)
    if (problem) return
    run(async () => {
      await requestResetCode(email)
      setCooldown(RESEND_SECONDS)
      setStep('code')
    })
  }
  const resend = () =>
    run(async () => {
      await requestResetCode(email)
      setCooldown(RESEND_SECONDS)
      setState({ busy: false, error: null, note: t('A new code is on its way.') })
    })
  const checkCode = (event) => {
    event.preventDefault()
    if (!/^\d{6}$/.test(code)) return setFieldError('Enter the 6-digit code.')
    setFieldError(null)
    run(async () => {
      setPass(await verifyResetCode({ email, code }))
      setStep('password')
    })
  }
  const savePassword = (event) => {
    event.preventDefault()
    const problem = validateNewPassword(password) ?? (confirm !== password ? 'The passwords do not match.' : undefined)
    setFieldError(problem ?? null)
    if (problem) return
    run(async () => {
      await updatePassword(password, { reset: pass })
      try {
        await signIn({ username: email, password }) // the account is found by email; the session starts and the guard moves on
      } catch {
        navigate(ROUTES.login) // the password is changed; logging in by hand is the fallback
      }
    })
  }

  const backToLogin = (
    <Typography variant="body2" color="text.secondary">
      {t('Remembered it?')} <Link component={RouterLink} to={ROUTES.login}>{t('Back to log in')}</Link>
    </Typography>
  )
  const disabled = !isBackendConfigured

  if (step === 'password') {
    return (
      <AuthLayout title="Choose a new password" subtitle="The code was right. Now set a new password and you will be logged in." footer={backToLogin}>
        <Box component="form" noValidate onSubmit={savePassword} sx={{ display: 'grid', gap: 2.5 }}>
          <PasswordField name="new-password" label="New password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" helperText={t('At least {count} characters.', { count: PASSWORD_MIN_LENGTH })} error={fieldError && fieldError !== 'The passwords do not match.' ? fieldError : undefined} />
          <PasswordField name="confirm-password" label="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" error={fieldError === 'The passwords do not match.' ? fieldError : undefined} />
          <FormError message={state.error} />
          <SubmitButton loading={state.busy} loadingLabel={t('Saving…')} disabled={disabled}>{t('Save password and log in')}</SubmitButton>
        </Box>
      </AuthLayout>
    )
  }

  if (step === 'code') {
    return (
      <AuthLayout title="Enter the code" subtitle="If an account exists for that email, we sent it a 6-digit code. It works for 10 minutes." footer={backToLogin}>
        <Box component="form" noValidate onSubmit={checkCode} sx={{ display: 'grid', gap: 2.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{t('Sent to {email}', { email })}</Typography>
          <TextField
            id="field-code"
            label={t('6-digit code')}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            fullWidth
            autoFocus
            error={Boolean(fieldError)}
            helperText={fieldError ? t(fieldError) : undefined}
            slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'one-time-code', maxLength: 6, 'aria-label': t('6-digit code'), style: { letterSpacing: '0.5em', fontSize: '1.4rem', fontWeight: 700, textAlign: 'center' } } }}
          />
          <FormError message={state.error} />
          {state.note && <Typography role="status" variant="body2">{state.note}</Typography>}
          <SubmitButton loading={state.busy} loadingLabel={t('Checking…')} disabled={disabled}>{t('Verify code')}</SubmitButton>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
            <Button size="small" onClick={resend} disabled={state.busy || cooldown > 0}>{cooldown > 0 ? t('Resend code in {n}s', { n: cooldown }) : t('Resend code')}</Button>
            <Button size="small" onClick={() => { setStep('email'); setCode(''); setState({ busy: false, error: null, note: null }) }}>{t('Use a different email')}</Button>
          </Box>
        </Box>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Reset your password" subtitle="Enter your email and we will send you a 6-digit code to choose a new password." footer={backToLogin}>
      <Box component="form" noValidate onSubmit={sendCode} sx={{ display: 'grid', gap: 2.5 }}>
        <TextInput name="email" label={t('Email')} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fieldError} />
        <FormError message={state.error} />
        <SubmitButton loading={state.busy} loadingLabel={t('Sending…')} disabled={disabled}>{t('Send code')}</SubmitButton>
      </Box>
    </AuthLayout>
  )
}
