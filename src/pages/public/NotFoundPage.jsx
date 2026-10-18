import { Link as RouterLink } from 'react-router-dom'
import { Button, Container, Typography } from '@mui/material'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { useI18n } from '../../hooks/useI18n.js'

export default function NotFoundPage() {
  const { t } = useI18n()
  usePageMeta(t('Page not found'))
  return (
    <Container maxWidth="sm" sx={{ py: 10, textAlign: 'center' }}>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('Page not found')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {t('The page you are looking for does not exist.')}
      </Typography>
      <Button component={RouterLink} to="/" variant="contained">
        {t('Back to home')}
      </Button>
    </Container>
  )
}
