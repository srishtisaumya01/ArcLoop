import { Alert } from '@mui/material'

// Server-side failure message. Rendered only when there is an error, so
// `role="alert"` announces it when it appears.
export default function FormError({ message }) {
  if (!message) return null
  return (
    <Alert severity="error" variant="outlined" role="alert">
      {message}
    </Alert>
  )
}
