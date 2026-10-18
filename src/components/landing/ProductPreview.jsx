import { Box, Typography } from '@mui/material'
import { Check, Flame } from 'lucide-react'
import DemoBadge from '../ui/DemoBadge.jsx'
import { DEMO_PREVIEW_HABITS } from '../../constants/landingContent.js'
import { colors, gradients, radii, shadows } from '../../theme/tokens.js'

const WEEK = [
  { d: 'M', v: 1 },
  { d: 'T', v: 1 },
  { d: 'W', v: 0.5 },
  { d: 'T', v: 1 },
  { d: 'F', v: 0 },
  { d: 'S', v: 0 },
  { d: 'S', v: 0 },
]

// Static illustration of the planned dashboard. Not interactive, not real data.
export default function ProductPreview() {
  return (
    <Box
      role="img"
      aria-label="Illustrative preview of the Arcloop dashboard showing today's habits and weekly progress, using sample data"
      sx={{
        bgcolor: colors.surface,
        color: colors.textPrimary,
        border: `1px solid ${colors.border}`,
        borderRadius: `${radii.lg}px`,
        boxShadow: shadows.lg,
        p: { xs: 2.5, md: 3.5 },
        width: '100%',
        maxWidth: 520,
        mx: 'auto',
      }}
    >
      <Box aria-hidden="true">
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="h4" component="p">
            Today
          </Typography>
          <DemoBadge label="Sample data" />
        </Box>

        <Box sx={{ display: 'grid', gap: 1.25 }}>
          {DEMO_PREVIEW_HABITS.map((h) => (
            <Box
              key={h.name}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                p: 1.5,
                borderRadius: `${radii.md}px`,
                bgcolor: h.done ? colors.bgAlt : colors.bg,
                border: `1px solid ${colors.border}`,
              }}
            >
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  flexShrink: 0,
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: h.done ? colors.navy900 : 'transparent',
                  border: `2px solid ${h.done ? colors.navy900 : colors.textMuted}`,
                  color: colors.textOnDark,
                }}
              >
                {h.done && <Check size={16} strokeWidth={3} />}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, lineHeight: 1.3 }}>{h.name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {h.note}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>

        <Box sx={{ mt: 3, p: 2, borderRadius: `${radii.md}px`, background: gradients.brand, color: colors.textOnDark }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography sx={{ fontWeight: 700 }}>This week</Typography>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: colors.mint300 }}>
              <Flame size={16} />
              <Typography variant="body2" sx={{ color: 'inherit', fontWeight: 700 }}>
                4 of 7 days
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.75, alignItems: 'end', height: 64 }}>
            {WEEK.map((w, i) => (
              <Box key={i} sx={{ textAlign: 'center' }}>
                <Box
                  sx={{
                    height: 8 + w.v * 36,
                    borderRadius: 1,
                    bgcolor: w.v ? colors.mint300 : 'rgba(255,255,255,0.18)',
                    opacity: w.v === 0.5 ? 0.6 : 1,
                  }}
                />
              </Box>
            ))}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.75, mt: 0.75 }}>
            {WEEK.map((w, i) => (
              <Typography key={i} variant="body2" sx={{ textAlign: 'center', color: colors.textOnDarkMuted, fontSize: '0.75rem' }}>
                {w.d}
              </Typography>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
