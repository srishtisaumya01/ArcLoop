import { Box, Card, CardContent, Typography } from '@mui/material'
import { AlarmClock, ChartColumn, HeartHandshake, MailOpen, Users, Zap } from 'lucide-react'
import { AUTOMATIONS } from '../../constants/communityDemo.js'
import { colors, gradients } from '../../theme/tokens.js'

const ICONS = { welcome: MailOpen, reminder: AlarmClock, nudge: HeartHandshake, group: Users, report: ChartColumn }

// The planned automation workflows, one card each: what starts it and what the participant gets.
export default function AutomationCards({ columns = 3 }) {
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: `repeat(${columns}, 1fr)` } }}>
      {AUTOMATIONS.map((w) => {
        const Icon = ICONS[w.key] ?? Zap
        return (
          <li key={w.key}>
            <Card sx={{ height: '100%' }}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ width: 44, height: 44, borderRadius: '12px', display: 'grid', placeItems: 'center', background: gradients.brand, color: colors.textOnDark, mb: 2 }}>
                  <Icon size={22} aria-hidden="true" />
                </Box>
                <Typography variant="h4" component="h3" sx={{ mb: 1 }}>
                  {w.title}
                </Typography>
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1.25, py: 0.5, mb: 1.5, borderRadius: '8px', bgcolor: colors.bgAlt, color: colors.textSecondary }}>
                  <Zap size={14} aria-hidden="true" />
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'inherit' }}>
                    {w.trigger}
                  </Typography>
                </Box>
                <Typography color="text.secondary">{w.action}</Typography>
              </CardContent>
            </Card>
          </li>
        )
      })}
    </Box>
  )
}
