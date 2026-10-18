import { TextField } from '@mui/material'
import { useI18n } from '../../hooks/useI18n.js'

// Labelled text field wired for the `useForm` conventions (id `field-<name>`,
// message linked via aria-describedby).
export default function TextInput({ name, label, error, helperText, ...rest }) {
  const { t } = useI18n()
  const helperId = `field-${name}-help`
  return (
    <TextField
      {...rest}
      id={`field-${name}`}
      name={name}
      label={label}
      fullWidth
      error={Boolean(error)}
      helperText={error ? t(error) : helperText}
      slotProps={{
        htmlInput: { 'aria-invalid': Boolean(error), 'aria-describedby': error || helperText ? helperId : undefined },
        formHelperText: { id: helperId },
      }}
    />
  )
}
