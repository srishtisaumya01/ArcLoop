import { Link as RouterLink } from 'react-router-dom'
import { Button, Container, Typography } from '@mui/material'
import { usePageMeta } from '../../hooks/usePageMeta.js'

export default function NotFoundPage() {
  usePageMeta('Page not found')
  return (
    <Container maxWidth="sm" sx={{ py: 10, textAlign: 'center' }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Page not found
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        The page you are looking for does not exist.
      </Typography>
      <Button component={RouterLink} to="/" variant="contained">
        Back to home
      </Button>
    </Container>
  )
}
