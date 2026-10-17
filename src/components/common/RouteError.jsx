import { Link as RouterLink } from 'react-router-dom'
import { Button, Container, Stack } from '@mui/material'
import { WifiOff } from 'lucide-react'
import StatePanel from './StatePanel.jsx'
import { usePageMeta } from '../../hooks/usePageMeta.js'

// Shown when a page cannot be loaded or crashes while rendering, most often because the connection dropped
// before its code arrived. Arcloop has no offline mode, so this says so plainly instead of showing a developer error.
export default function RouteError() {
  usePageMeta('Something went wrong')
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false
  return (
    <Container maxWidth="sm" sx={{ py: { xs: 6, md: 10 } }}>
      <StatePanel
        icon={WifiOff}
        tone="error"
        headingLevel={1}
        title="This page didn’t load"
        text={offline ? 'You seem to be offline. Arcloop needs a connection to open pages and your plans. Nothing you saved is lost.' : 'Something went wrong while opening this page. Nothing you saved is lost.'}
        action={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ justifyContent: 'center' }}>
            <Button variant="contained" onClick={() => window.location.reload()}>Try again</Button>
            <Button component={RouterLink} to="/" variant="outlined">Back to home</Button>
          </Stack>
        }
      />
    </Container>
  )
}
