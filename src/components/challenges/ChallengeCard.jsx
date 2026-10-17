import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Card, CardContent, Chip, Typography } from '@mui/material'
import { Clock, Globe, Mail } from 'lucide-react'
import DemoBadge from '../ui/DemoBadge.jsx'
import { challengePath } from '../../constants/navigation.js'
import { colors, shadows } from '../../theme/tokens.js'

export function VisibilityChip({ visibility }) {
  const isPublic = visibility === 'public'
  const Icon = isPublic ? Globe : Mail
  return (
    <Chip
      size="small"
      variant="outlined"
      icon={<Icon size={14} aria-hidden="true" />}
      label={isPublic ? 'Public' : 'Invite only'}
    />
  )
}

// Demo-labelled card. `showActions=false` renders title and summary only.
export default function ChallengeCard({ challenge, showActions = true }) {
  const { slug, title, summary, category, durationLabel, visibility } = challenge
  const titleId = `challenge-${slug}-title`
  return (
    <Card component="article" aria-labelledby={titleId} sx={{ height: '100%', display: 'flex', flexDirection: 'column', '&:hover': { boxShadow: shadows.md, transform: 'translateY(-2px)' } }}>
      <CardContent sx={{ p: 3.5, display: 'flex', flexDirection: 'column', flex: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 2 }}>
          <Chip label={category} size="small" sx={{ bgcolor: colors.bgAlt }} />
          <DemoBadge label="Demo" />
        </Box>
        <Typography variant="h4" component="h3" id={titleId} sx={{ mb: 1 }}>
          {title}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2.5 }}>
          {summary}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: showActions ? 3 : 0, mt: 'auto' }}>
          <Chip size="small" variant="outlined" icon={<Clock size={14} aria-hidden="true" />} label={durationLabel} />
          <VisibilityChip visibility={visibility} />
        </Box>
        {showActions && (
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <Button component={RouterLink} to={challengePath(slug)} variant="outlined" color="primary" size="small" aria-label={`View details: ${title}`}>
              View details
            </Button>
            <Button component={RouterLink} to={`${challengePath(slug)}#join`} variant="contained" color="primary" size="small" aria-label={`Join ${title}`}>
              {visibility === 'public' ? 'Join' : 'Join with invite'}
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  )
}
