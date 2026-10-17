import { Button, CircularProgress } from '@mui/material'

export default function SubmitButton({ loading, loadingLabel, disabled = false, children }) {
  return (
    <Button
      type="submit"
      variant="contained"
      color="primary"
      size="large"
      fullWidth
      disabled={loading || disabled}
      aria-busy={loading}
      startIcon={loading ? <CircularProgress size={18} color="inherit" aria-hidden="true" /> : null}
    >
      {loading ? loadingLabel : children}
    </Button>
  )
}
