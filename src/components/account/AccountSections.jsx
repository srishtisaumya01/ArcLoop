import { useRef, useState } from 'react'
import { Box, Button, TextField, Typography } from '@mui/material'
import { Camera, Trash2 } from 'lucide-react'
import UserAvatar from '../app/UserAvatar.jsx'
import FormError from '../auth/FormError.jsx'
import PasswordField from '../auth/PasswordField.jsx'
import SettingsSection from '../settings/SettingsSection.jsx'
import { useAuth } from '../../hooks/useAuth.js'
import { useI18n } from '../../hooks/useI18n.js'
import { changeEmail, updatePassword } from '../../services/authService.js'
import { removeAvatar, updateUsername, uploadAvatar } from '../../services/accountService.js'
import { shrinkToAvatar } from '../../utils/avatarImage.js'
import { validateEmail, validateNewPassword, validateUsername } from '../../utils/validation.js'

// The pieces of the Profile page. Each one saves on its own and says plainly what happened.

function useAction() {
  const [state, setState] = useState({ busy: false, error: null, done: null })
  const run = async (work, done) => {
    setState({ busy: true, error: null, done: null })
    try {
      await work()
      setState({ busy: false, error: null, done })
      return true
    } catch (error) {
      setState({ busy: false, error: error?.message || 'Something went wrong. Please try again.', done: null })
      return false
    }
  }
  return [state, run, () => setState((s) => ({ ...s, done: null, error: null }))]
}

export function PhotoSection({ profile, name }) {
  const { t } = useI18n()
  const input = useRef(null)
  const [state, run] = useAction()

  const pick = (event) => {
    const file = event.target.files?.[0]
    event.target.value = '' // so choosing the same file again still fires
    if (file) run(async () => uploadAvatar(await shrinkToAvatar(file)), t('Photo updated.'))
  }

  return (
    <SettingsSection title={t('Profile photo')} description={t('A square picture works best. It is shrunk on your device before it is uploaded.')}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, flexWrap: 'wrap' }}>
        <UserAvatar name={name} version={profile.avatar_version} size={96} />
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pick} aria-label={t('Choose a photo')} />
          <Button variant="contained" size="small" startIcon={<Camera size={16} aria-hidden="true" />} disabled={state.busy} onClick={() => input.current?.click()}>
            {profile.avatar_version ? t('Change photo') : t('Upload photo')}
          </Button>
          {profile.avatar_version && (
            <Button variant="outlined" size="small" startIcon={<Trash2 size={16} aria-hidden="true" />} disabled={state.busy} onClick={() => run(removeAvatar, t('Photo removed.'))}>
              {t('Remove photo')}
            </Button>
          )}
        </Box>
      </Box>
      <FormError message={state.error} />
      {state.done && <Typography role="status">{state.done}</Typography>}
    </SettingsSection>
  )
}

export function UsernameSection({ profile }) {
  const { t } = useI18n()
  const saved = profile.username ?? ''
  const [value, setValue] = useState(saved)
  const [state, run, clear] = useAction()
  const problem = validateUsername(value)
  const dirty = value.trim().toLowerCase() !== saved

  const submit = (e) => {
    e.preventDefault()
    if (!problem && dirty) run(() => updateUsername(value), t('Username changed. Use it the next time you log in.'))
  }

  return (
    <SettingsSection title={t('Username')} description={t('You log in with your username. It is shown instead of your email.')} component="form" onSubmit={submit} noValidate aria-label={t('Username')}>
      <TextField id="field-username" label={t('Username')} value={value} autoComplete="username" slotProps={{ htmlInput: { autoCapitalize: 'none', spellCheck: false } }}
        onChange={(e) => { setValue(e.target.value); clear() }} error={dirty && Boolean(problem)} helperText={dirty && problem ? t(problem) : t('3 to 30 letters, numbers, dots or underscores.')} />
      <FormError message={state.error} />
      {state.done && <Typography role="status">{state.done}</Typography>}
      <Box><Button type="submit" variant="contained" disabled={state.busy || !dirty || Boolean(problem)}>{t('Save username')}</Button></Box>
    </SettingsSection>
  )
}

export function EmailSection() {
  const { t } = useI18n()
  const { user } = useAuth()
  const [email, setEmail] = useState(user.email)
  const [password, setPassword] = useState('')
  const [state, run, clear] = useAction()
  const problem = validateEmail(email)
  const dirty = email.trim().toLowerCase() !== user.email

  const submit = async (e) => {
    e.preventDefault()
    if (problem || !dirty || !password) return
    if (await run(() => changeEmail({ email, password }), t('Email changed.'))) setPassword('')
  }

  return (
    <SettingsSection title={t('Email')} description={t('Used for password reset emails. Changing it needs your password.')} component="form" onSubmit={submit} noValidate aria-label={t('Email')}>
      <TextField id="field-email" label={t('Email')} type="email" value={email} autoComplete="email" onChange={(e) => { setEmail(e.target.value); clear() }} error={dirty && Boolean(problem)} helperText={dirty && problem ? t(problem) : undefined} />
      <PasswordField name="email-password" label="Current password" value={password} onChange={(e) => { setPassword(e.target.value); clear() }} autoComplete="current-password" />
      <FormError message={state.error} />
      {state.done && <Typography role="status">{state.done}</Typography>}
      <Box><Button type="submit" variant="contained" disabled={state.busy || !dirty || Boolean(problem) || !password}>{t('Save email')}</Button></Box>
    </SettingsSection>
  )
}

export function PasswordSection() {
  const { t } = useI18n()
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [state, run, clear] = useAction()
  const set = (key) => (e) => { setForm((f) => ({ ...f, [key]: e.target.value })); clear() }
  const problem = form.next ? validateNewPassword(form.next) : undefined
  const mismatch = form.confirm && form.confirm !== form.next
  const ready = form.current && form.next && !problem && form.confirm === form.next

  const submit = async (e) => {
    e.preventDefault()
    if (ready && (await run(() => updatePassword(form.next, { currentPassword: form.current }), t('Password changed. Your other devices were logged out.')))) setForm({ current: '', next: '', confirm: '' })
  }

  return (
    <SettingsSection title={t('Password')} description={t('Choose a new password. Other devices will need to log in again.')} component="form" onSubmit={submit} noValidate aria-label={t('Password')}>
      <PasswordField name="current-password" label="Current password" value={form.current} onChange={set('current')} autoComplete="current-password" />
      <PasswordField name="new-password" label="New password" value={form.next} onChange={set('next')} error={problem} autoComplete="new-password" />
      <PasswordField name="confirm-password" label="Confirm new password" value={form.confirm} onChange={set('confirm')} error={mismatch ? 'The passwords do not match.' : undefined} autoComplete="new-password" />
      <FormError message={state.error} />
      {state.done && <Typography role="status">{state.done}</Typography>}
      <Box><Button type="submit" variant="contained" disabled={state.busy || !ready}>{t('Change password')}</Button></Box>
    </SettingsSection>
  )
}
