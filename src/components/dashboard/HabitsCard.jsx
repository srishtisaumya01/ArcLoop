import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Card, CardContent, LinearProgress, Typography } from '@mui/material'
import { ArrowRight } from 'lucide-react'
import Reveal from '../ui/Reveal.jsx'
import { useI18n } from '../../hooks/useI18n.js'
import { ROUTES } from '../../constants/navigation.js'
import { colors } from '../../theme/tokens.js'

// The repeating tasks that are going best over the last four weeks.
export default function HabitsCard({ habits, days = 28 }) {
  const { t } = useI18n()
  return (
    <Reveal delay={120}>
      <Card>
        <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
          <Typography variant="h4" component="h2">
            {t('Repeating tasks')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('Last {count} days', { count: days })}
          </Typography>
          {habits.length === 0 ? (
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              {t('No repeating tasks yet. Add one and it comes back on its own.')}
            </Typography>
          ) : (
            <Box component="ul" aria-label={t('Repeating tasks')} sx={{ listStyle: 'none', m: 0, mb: 2, p: 0, display: 'grid', gap: 2 }}>
              {habits.map((h) => (
                <li key={h.templateId}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.5 }}>
                    <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{h.title}</Typography>
                    <Typography sx={{ fontWeight: 700 }}>{h.percent}%</Typography>
                  </Box>
                  <LinearProgress variant="determinate" value={h.percent} aria-label={`${h.title}: ${h.percent}%`} sx={{ height: 8, borderRadius: 4, bgcolor: colors.bgAlt, '& .MuiLinearProgress-bar': { borderRadius: 4 } }} />
                </li>
              ))}
            </Box>
          )}
          <Button component={RouterLink} to={habits.length === 0 ? ROUTES.recurring : ROUTES.progress} variant="outlined" color="primary" size="small" endIcon={<ArrowRight size={16} aria-hidden="true" />}>
            {habits.length === 0 ? t('Add a repeating task') : t('See all progress')}
          </Button>
        </CardContent>
      </Card>
    </Reveal>
  )
}
