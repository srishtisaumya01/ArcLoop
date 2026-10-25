import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Card, CardContent, Typography } from '@mui/material'
import { CalendarCheck, Sparkles, Trophy } from 'lucide-react'
import Reveal from '../ui/Reveal.jsx'
import { useI18n } from '../../hooks/useI18n.js'
import { ROUTES } from '../../constants/navigation.js'
import { colors, gradients } from '../../theme/tokens.js'

// For someone who has not planned anything yet: two small first steps instead of empty charts.
export default function FirstSteps() {
  const { t } = useI18n()
  const steps = [
    { icon: CalendarCheck, title: 'Plan today', text: 'Add one or two tasks for today and tick them off as you go.', to: ROUTES.day, action: 'Open My Day' },
    { icon: Trophy, title: 'Join a challenge', text: 'Pick a challenge, mark attendance each day and build a streak.', to: ROUTES.appChallenges, action: 'Browse challenges' },
  ]
  return (
    <Reveal>
      <Card>
        <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
            <Box sx={{ width: 44, height: 44, borderRadius: '14px', display: 'grid', placeItems: 'center', background: gradients.brand, color: colors.textOnDark }}>
              <Sparkles size={22} aria-hidden="true" />
            </Box>
            <Box>
              <Typography variant="h4" component="h2">
                {t('Let’s get your first week going')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('Nothing is planned yet. Two small steps get this dashboard moving.')}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
            {steps.map(({ icon: Icon, title, text, to, action }) => (
              <Box key={title} sx={{ p: 2.5, borderRadius: '14px', bgcolor: colors.bgAlt, border: `1px solid ${colors.border}` }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: colors.blue600, mb: 1 }}>
                  <Icon size={20} aria-hidden="true" />
                  <Typography sx={{ fontWeight: 800, color: colors.textPrimary }}>{t(title)}</Typography>
                </Box>
                <Typography color="text.secondary" sx={{ mb: 2 }}>
                  {t(text)}
                </Typography>
                <Button component={RouterLink} to={to} variant="contained" color="primary" size="small">
                  {t(action)}
                </Button>
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>
    </Reveal>
  )
}
