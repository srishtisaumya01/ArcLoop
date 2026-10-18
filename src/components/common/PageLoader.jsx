import { Box, CircularProgress } from '@mui/material'
import { useI18n } from '../../hooks/useI18n.js'

export default function PageLoader() {
  const { t } = useI18n()
  return (
    <Box role="status" aria-label={t('Loading page')} sx={{ minHeight: '50vh', display: 'grid', placeItems: 'center' }}>
      <CircularProgress aria-hidden="true" />
    </Box>
  )
}
