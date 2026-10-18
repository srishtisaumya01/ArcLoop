import { Alert } from '@mui/material'
import { useI18n } from '../../hooks/useI18n.js'

// Server-side failure message. Rendered only when there is an error, so
// `role="alert"` announces it when it appears.
export default function FormError({ message }) {
  const { t } = useI18n()
  if (!message) return null
  return (
    <Alert severity="error" variant="outlined" role="alert">
      {t(message)}
    </Alert>
  )
}
