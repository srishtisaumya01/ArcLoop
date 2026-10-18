import { Box, Card, CardContent, Typography } from '@mui/material'
import { AlarmClock, ChartColumn, HeartHandshake, MailOpen, Users, Zap } from 'lucide-react'
import Reveal from '../ui/Reveal.jsx'
import { useI18n } from '../../hooks/useI18n.js'
import { AUTOMATIONS } from '../../constants/communityDemo.js'
import { colors, gradients } from '../../theme/tokens.js'

const ICONS = { welcome: MailOpen, reminder: AlarmClock, nudge: HeartHandshake, group: Users, report: ChartColumn }

// The planned automation workflows, one card each: what starts it and what the participant gets.
export default function AutomationCards({ columns = 3 }) {
  const { t } = useI18n()
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: `repeat(${columns}, 1fr)` } }}>
      {AUTOMATIONS.map((w, i) => {
        const Icon = ICONS[w.key] ?? Zap
        return (
          <Reveal as="li" key={w.key} delay={(i % columns) * 110}>
            <Card sx={{ height: '100%', '&:hover': { transform: 'translateY(-3px)', boxShadow: '0 12px 30px rgba(11, 27, 58, 0.12)' }, '&:hover .automation-icon': { transform: 'scale(1.08) rotate(-4deg)' } }}>
              <CardContent sx={{ p: 3 }}>
                <Box className="automation-icon" sx={{ width: 44, height: 44, borderRadius: '12px', display: 'grid', placeItems: 'center', background: gradients.brand, color: colors.textOnDark, mb: 2, transition: 'transform 240ms cubic-bezier(0.2, 0.7, 0.2, 1)' }}>
                  <Icon size={22} aria-hidden="true" />
                </Box>
                <Typography variant="h4" component="h3" sx={{ mb: 1 }}>
                  {t(w.title)}
                </Typography>
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1.25, py: 0.5, mb: 1.5, borderRadius: '8px', bgcolor: colors.bgAlt, color: colors.textSecondary }}>
                  <Zap size={14} aria-hidden="true" />
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'inherit' }}>
                    {t(w.trigger)}
                  </Typography>
                </Box>
                <Typography color="text.secondary">{t(w.action)}</Typography>
              </CardContent>
            </Card>
          </Reveal>
        )
      })}
    </Box>
  )
}
