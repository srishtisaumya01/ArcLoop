import { Box, LinearProgress, Typography } from '@mui/material'
import DemoBadge from '../ui/DemoBadge.jsx'
import { colors, radii } from '../../theme/tokens.js'

// Illustrative progress only. Participants are anonymous, labelled samples;
// nothing here comes from real users.
export default function ProgressPreview({ progress }) {
  return (
    <Box sx={{ border: `1px solid ${colors.border}`, borderRadius: `${radii.lg}px`, bgcolor: colors.surface, p: { xs: 2.5, md: 3.5 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Typography variant="h3" component="h2">
          Progress preview
        </Typography>
        <DemoBadge label="Sample data" />
      </Box>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        This is how shared progress could look. Percentages show consistency, and only people who choose to share appear.
      </Typography>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 2.5 }}>
        {progress.map((p) => (
          <li key={p.label}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
              <Typography sx={{ fontWeight: 600 }}>{p.label}</Typography>
              <Typography sx={{ fontWeight: 700 }}>{p.percent}%</Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={p.percent}
              aria-label={`${p.label} consistency`}
              sx={{ height: 10, borderRadius: 5, bgcolor: colors.bgAlt, '& .MuiLinearProgress-bar': { bgcolor: colors.blue600, borderRadius: 5 } }}
            />
          </li>
        ))}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
        Your own progress will appear here after you sign in and join. That is not available yet.
      </Typography>
    </Box>
  )
}
