import { useState } from 'react'
import { IconButton, InputAdornment, TextField } from '@mui/material'
import { Eye, EyeOff } from 'lucide-react'
import { useI18n } from '../../hooks/useI18n.js'

// Password input with an accessible show/hide toggle.
export default function PasswordField({ name = 'password', label = 'Password', error, helperText, autoComplete, ...rest }) {
  const [visible, setVisible] = useState(false)
  const { t } = useI18n()
  const helperId = `field-${name}-help`
  return (
    <TextField
      {...rest}
      id={`field-${name}`}
      name={name}
      label={t(label)}
      type={visible ? 'text' : 'password'}
      autoComplete={autoComplete}
      fullWidth
      error={Boolean(error)}
      helperText={error ? t(error) : helperText}
      slotProps={{
        htmlInput: { 'aria-invalid': Boolean(error), 'aria-describedby': error || helperText ? helperId : undefined },
        formHelperText: { id: helperId },
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                edge="end"
                onClick={() => setVisible((v) => !v)}
                aria-label={visible ? t('Hide password') : t('Show password')}
                aria-pressed={visible}
                sx={{ width: 44, height: 44 }}
              >
                {visible ? <EyeOff size={20} /> : <Eye size={20} />}
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  )
}
