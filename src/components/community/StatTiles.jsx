import { Box, Typography } from '@mui/material'
import { CheckCheck, TrendingUp, Users, UsersRound } from 'lucide-react'
import CountUp from '../ui/CountUp.jsx'
import Reveal from '../ui/Reveal.jsx'
import { useI18n } from '../../hooks/useI18n.js'
import { colors, gradients, radii, shadows } from '../../theme/tokens.js'

const ICONS = { participants: Users, checkins: CheckCheck, consistency: TrendingUp, groups: UsersRound }

// Headline numbers: one value per tile, counting up on first view, with a short note under it.
export default function StatTiles({ stats, elevated = false }) {
  const { t } = useI18n()
  return (
    <Box component="dl" sx={{ m: 0, display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: `repeat(${stats.length}, 1fr)` } }}>
      {stats.map((s, i) => {
        const Icon = ICONS[s.key]
        return (
          <Reveal key={s.label} delay={i * 110} sx={{ display: 'flex' }}>
            <Box
              sx={{
                flex: 1,
                bgcolor: colors.surface,
                border: `1px solid ${colors.border}`,
                borderRadius: `${radii.md}px`,
                boxShadow: elevated ? shadows.lg : shadows.sm,
                p: { xs: 2, md: 2.5 },
                display: 'flex',
                flexDirection: 'column',
                transition: 'transform 240ms cubic-bezier(0.2, 0.7, 0.2, 1), box-shadow 240ms',
                '&:hover': { transform: 'translateY(-4px)', boxShadow: shadows.lg },
                '&:hover .stat-icon': { transform: 'scale(1.1) rotate(-6deg)' },
              }}
            >
              {Icon && (
                <Box className="stat-icon" sx={{ width: 40, height: 40, mb: 1.5, borderRadius: '12px', display: 'grid', placeItems: 'center', background: gradients.brand, color: colors.textOnDark, transition: 'transform 240ms cubic-bezier(0.2, 0.7, 0.2, 1)' }}>
                  <Icon size={20} aria-hidden="true" />
                </Box>
              )}
              <Typography component="dt" variant="body2" sx={{ color: colors.textSecondary, fontWeight: 600, order: 1 }}>
                {t(s.label)}
              </Typography>
              <Typography component="dd" sx={{ m: 0, order: 0, fontSize: { xs: '1.75rem', md: '2.25rem' }, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1, mb: 0.5 }}>
                <CountUp value={s.value} suffix={s.suffix} />
              </Typography>
              <Typography component="dd" variant="body2" sx={{ m: 0, order: 2, color: colors.textMuted, mt: 0.5 }}>
                {t(s.note)}
              </Typography>
            </Box>
          </Reveal>
        )
      })}
    </Box>
  )
}
