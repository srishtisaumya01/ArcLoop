import { Box, Card, CardContent, Typography } from '@mui/material'
import DemoBadge from '../ui/DemoBadge.jsx'
import { useI18n } from '../../hooks/useI18n.js'

// Card frame for a chart: title, one-line takeaway and the sample-data badge.
export default function ChartCard({ title, subtitle, badge = 'Sample data', children }) {
  const { t } = useI18n()
  return (
    <Card component="figure" sx={{ m: 0 }}>
      <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
        <Box component="figcaption" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 2.5 }}>
          <Box>
            <Typography variant="h4" component="h3">
              {t(title)}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {t(subtitle)}
              </Typography>
            )}
          </Box>
          {badge && <DemoBadge label={badge} />}
        </Box>
        {children}
      </CardContent>
    </Card>
  )
}
