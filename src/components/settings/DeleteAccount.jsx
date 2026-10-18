import { useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, TextField, Typography } from '@mui/material'
import FormError from '../auth/FormError.jsx'
import { deleteAccount } from '../../services/authService.js'
import { colors } from '../../theme/tokens.js'

// Permanent account deletion. It is deliberately a few steps away: a dialog that says exactly what goes, asks for
// the password again and for the word DELETE, and only then calls the server, which checks both again.
export default function DeleteAccount() {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [state, setState] = useState({ busy: false, error: null })

  const close = () => {
    if (state.busy) return
    setOpen(false)
    setPassword('')
    setConfirmation('')
    setState({ busy: false, error: null })
  }

  const submit = async (event) => {
    event.preventDefault()
    setState({ busy: true, error: null })
    try {
      await deleteAccount({ password, confirmation })
      // Nothing more to do: the session is cleared, so the route guard sends the person to the log-in page.
    } catch (error) {
      setState({ busy: false, error: error?.message || 'We could not delete your account. Please try again.' })
    }
  }

  const ready = password !== '' && confirmation === 'DELETE'

  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <Typography variant="body2" color="text.secondary">
        Deleting your account removes your profile, plans, tasks, repeating tasks, progress history and reminders for good. This cannot be undone.
      </Typography>
      <Box>
        <Button variant="outlined" size="small" onClick={() => setOpen(true)} sx={{ color: colors.error, borderColor: colors.error }}>
          Delete account
        </Button>
      </Box>
      <Dialog open={open} onClose={close} aria-labelledby="delete-account-title" fullWidth maxWidth="xs">
        {/* The form is a flex column inside the dialog paper, so on a short screen only the middle scrolls: the title and the two
            buttons stay in view. */}
        <Box component="form" noValidate onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 }}>
          <DialogTitle id="delete-account-title">Delete your account?</DialogTitle>
          <DialogContent sx={{ display: 'grid', gap: 2 }}>
            <DialogContentText>
              Everything you have planned and recorded in Arcloop will be permanently deleted. You will be signed out on every device.
            </DialogContentText>
            <TextField label="Your password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <TextField label="Type DELETE to confirm" autoComplete="off" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
            <FormError message={state.error} />
          </DialogContent>
          {/* Stacked on a narrow screen (full-width, easy to hit, no wrapped labels); side by side from `sm` up. */}
          <DialogActions sx={{ flexDirection: { xs: 'column', sm: 'row' }, alignItems: 'stretch', gap: 1, px: 3, pb: 2, '& > :not(style)': { m: 0 } }}>
            <Button onClick={close} disabled={state.busy}>Keep my account</Button>
            <Button type="submit" variant="contained" color="error" disabled={!ready || state.busy}>
              {state.busy ? 'Deleting…' : 'Delete everything'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  )
}
