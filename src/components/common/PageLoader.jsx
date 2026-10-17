import { Box, CircularProgress } from '@mui/material'

export default function PageLoader() {
  return (
    <Box role="status" aria-label="Loading page" sx={{ minHeight: '50vh', display: 'grid', placeItems: 'center' }}>
      <CircularProgress aria-hidden="true" />
    </Box>
  )
}
