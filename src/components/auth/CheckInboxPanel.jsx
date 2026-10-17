import { Box, Button, Typography } from '@mui/material'
import { MailCheck } from 'lucide-react'
import { colors } from '../../theme/tokens.js'

// "Check your inbox" confirmation used after sign-up and reset requests.
export default function CheckInboxPanel({ title, children, onBack, backLabel }) {
  return (
    <Box role="status" sx={{ textAlign: 'center' }}>
      <Box sx={{ width: 64, height: 64, mx: 'auto', mb: 2, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: colors.bgAlt, color: colors.blue600 }}>
        <MailCheck size={30} aria-hidden="true" />
      </Box>
      <Typography variant="h3" component="h2" sx={{ mb: 1 }}>
        {title}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {children}
      </Typography>
      <Button variant="outlined" color="primary" onClick={onBack}>
        {backLabel}
      </Button>
    </Box>
  )
}
