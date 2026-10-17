import { TextField } from '@mui/material'

// Labelled text field wired for the `useForm` conventions (id `field-<name>`,
// message linked via aria-describedby).
export default function TextInput({ name, label, error, helperText, ...rest }) {
  const helperId = `field-${name}-help`
  return (
    <TextField
      {...rest}
      id={`field-${name}`}
      name={name}
      label={label}
      fullWidth
      error={Boolean(error)}
      helperText={error || helperText}
      slotProps={{
        htmlInput: { 'aria-invalid': Boolean(error), 'aria-describedby': error || helperText ? helperId : undefined },
        formHelperText: { id: helperId },
      }}
    />
  )
}
