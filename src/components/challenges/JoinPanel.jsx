import { useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Typography } from '@mui/material'
import { CalendarDays, Clock, Eye, UserCheck } from 'lucide-react'
import { colors, shadows } from '../../theme/tokens.js'

function Fact({ icon: Icon, label, children }) {
  return (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
      <Box sx={{ color: colors.blue600, mt: '2px', flexShrink: 0 }}>
        <Icon size={18} aria-hidden="true" />
      </Box>
      <Box>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {label}
        </Typography>
        <Typography sx={{ fontWeight: 600 }}>{children}</Typography>
      </Box>
    </Box>
  )
}

// UI PROTOTYPE ONLY. Joining/leaving toggles local component state; nothing is
// saved and no account is involved. Real membership arrives with the backend.
export default function JoinPanel({ challenge }) {
  const [joined, setJoined] = useState(false)
  const inviteOnly = challenge.visibility !== 'public'

  return (
    <Card id="join" sx={{ boxShadow: shadows.md, scrollMarginTop: '96px' }}>
      <CardContent sx={{ p: 3.5, display: 'grid', gap: 2.5 }}>
        <Typography variant="h3" component="h2">
          Join this challenge
        </Typography>
        <Fact icon={Clock} label="Duration">{challenge.durationLabel}</Fact>
        <Fact icon={CalendarDays} label="Schedule">{challenge.scheduleLabel}</Fact>
        <Fact icon={Eye} label="Visibility">{inviteOnly ? 'Invite only' : 'Public'}</Fact>
        <Fact icon={UserCheck} label="Participation">{challenge.participation}</Fact>

        {inviteOnly ? (
          <Button variant="contained" color="primary" size="large" disabled>
            Invitation required
          </Button>
        ) : joined ? (
          <Button variant="outlined" color="primary" size="large" onClick={() => setJoined(false)}>
            Leave challenge
          </Button>
        ) : (
          <Button variant="contained" color="primary" size="large" onClick={() => setJoined(true)}>
            Join challenge
          </Button>
        )}

        <div aria-live="polite">
          {joined && !inviteOnly && (
            <Alert severity="info" variant="outlined">
              Preview only: you are not actually enrolled. Nothing was saved, and real joining arrives after sign-in is built.
            </Alert>
          )}
        </div>
        {!joined && (
          <Typography variant="body2" color="text.secondary">
            Prototype: joining is not connected to an account yet.
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}
