import { Box, Typography } from '@mui/material'
import { Check, Flame } from 'lucide-react'
import { keyframes } from '@mui/material/styles'
import DemoBadge from '../ui/DemoBadge.jsx'
import { useI18n } from '../../hooks/useI18n.js'
import { DEMO_PREVIEW_HABITS } from '../../constants/landingContent.js'
import { enter, floatY, grow, noMotion, popIn } from '../../theme/animations.js'
import { colors, gradients, radii, shadows } from '../../theme/tokens.js'

// The unchecked habit ticks itself now and then, as if someone had just checked in.
const tickCircle = keyframes`
  0%, 35% { background-color: transparent; border-color: ${colors.textMuted}; }
  45%, 85% { background-color: ${colors.ink}; border-color: ${colors.ink}; }
  95%, 100% { background-color: transparent; border-color: ${colors.textMuted}; }
`
const tickMark = keyframes`
  0%, 35% { opacity: 0; transform: scale(0.4); }
  45%, 85% { opacity: 1; transform: none; }
  95%, 100% { opacity: 0; transform: scale(0.4); }
`
const TICKING_ROW = 2

const WEEK = [
  { k: 'Mon', v: 1 },
  { k: 'Tue', v: 1 },
  { k: 'Wed', v: 0.5 },
  { k: 'Thu', v: 1 },
  { k: 'Fri', v: 0 },
  { k: 'Sat', v: 0 },
  { k: 'Sun', v: 0 },
]

// Illustration of the planned dashboard: gently floating, with the rows and bars animating in. Not interactive, not real data.
export default function ProductPreview() {
  const { t } = useI18n()
  // English shows the weekday's first letter; a translation (e.g. Hindi) supplies its own short form.
  const dayLabel = (k) => {
    const label = t(k)
    return label === k ? k[0] : label
  }
  return (
    <Box
      role="img"
      aria-label={t("Illustrative preview of the Arcloop dashboard showing today's habits and weekly progress")}
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
        animation: `${floatY} 7s ease-in-out 1.6s infinite`,
        ...noMotion,
      }}
    >
      <Box aria-hidden="true">
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="h4" component="p">
            {t('Today')}
          </Typography>
          <DemoBadge label="Sample data" />
        </Box>

        <Box sx={{ display: 'grid', gap: 1.25 }}>
          {DEMO_PREVIEW_HABITS.map((h, i) => (
            <Box
              key={h.name}
              sx={{
                ...enter(650 + i * 140, 600),
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
                  bgcolor: h.done ? colors.ink : 'transparent',
                  border: `2px solid ${h.done ? colors.ink : colors.textMuted}`,
                  color: colors.onInk,
                  ...(h.done && { animation: `${popIn} 500ms ease ${900 + i * 140}ms both`, ...noMotion }),
                  ...(i === TICKING_ROW && { animation: `${tickCircle} 7s ease-in-out 3s infinite`, ...noMotion }),
                }}
              >
                {h.done && <Check size={16} strokeWidth={3} />}
                {i === TICKING_ROW && (
                  <Box component="span" sx={{ display: 'flex', animation: `${tickMark} 7s ease-in-out 3s infinite`, ...noMotion }}>
                    <Check size={16} strokeWidth={3} />
                  </Box>
                )}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, lineHeight: 1.3 }}>{t(h.name)}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {t(h.note)}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>

        <Box sx={{ mt: 3, p: 2, borderRadius: `${radii.md}px`, background: gradients.brand, color: colors.textOnDark }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography sx={{ fontWeight: 700 }}>{t('This week')}</Typography>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: colors.mint300 }}>
              <Flame size={16} />
              <Typography variant="body2" sx={{ color: 'inherit', fontWeight: 700 }}>
                {t('4 of 7 days')}
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
                    transformOrigin: 'bottom',
                    animation: `${grow} 700ms cubic-bezier(0.2, 0.7, 0.2, 1) ${1300 + i * 90}ms both`,
                    ...noMotion,
                  }}
                />
              </Box>
            ))}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.75, mt: 0.75 }}>
            {WEEK.map((w, i) => (
              <Typography key={i} variant="body2" sx={{ textAlign: 'center', color: colors.textOnDarkMuted, fontSize: '0.75rem' }}>
                {dayLabel(w.k)}
              </Typography>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
