import { Box, Typography } from '@mui/material'
import { ArrowDown, ArrowRight, Split, User, Users } from 'lucide-react'
import { JOIN_BRANCHES, JOIN_STEPS } from '../../constants/communityDemo.js'
import { colors, gradients, radii, shadows } from '../../theme/tokens.js'

function StepNumber({ n }) {
  return (
    <Box sx={{ width: 32, height: 32, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', background: gradients.brand, color: colors.textOnDark, fontWeight: 800, fontSize: '0.9375rem' }}>
      {n}
    </Box>
  )
}

function Branch({ icon: Icon, branch, highlight }) {
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        p: { xs: 2.5, md: 3 },
        borderRadius: `${radii.lg}px`,
        bgcolor: colors.surface,
        border: highlight ? '2px solid transparent' : `1px solid ${colors.border}`,
        background: highlight ? `linear-gradient(${colors.surface}, ${colors.surface}) padding-box, ${gradients.brand} border-box` : colors.surface,
        boxShadow: shadows.md,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 2 }}>
        <Box sx={{ width: 40, height: 40, borderRadius: '12px', display: 'grid', placeItems: 'center', bgcolor: colors.bgAlt, color: colors.blue600 }}>
          <Icon size={22} aria-hidden="true" />
        </Box>
        <Typography variant="h4" component="h3">
          {branch.title}
        </Typography>
      </Box>
      <Box component="ol" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 1.25, '& li::marker': { color: colors.blue600, fontWeight: 700 } }}>
        {branch.steps.map((s) => (
          <Typography component="li" key={s} color="text.secondary">
            {s}
          </Typography>
        ))}
      </Box>
    </Box>
  )
}

// The join journey: three shared steps, then the solo/group fork, then the shared daily loop.
export default function JoinFlow() {
  return (
    <Box>
      <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: 'stretch', gap: { xs: 1, md: 1.5 } }}>
        {JOIN_STEPS.map((s, i) => (
          <Box component="li" key={s.title} sx={{ flex: 1, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'stretch', md: 'center' }, gap: { xs: 1, md: 1.5 } }}>
            <Box sx={{ flex: 1, height: '100%', p: 2.5, borderRadius: `${radii.md}px`, bgcolor: colors.surface, border: `1px solid ${colors.border}`, boxShadow: shadows.sm }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1 }}>
                <StepNumber n={i + 1} />
                <Typography sx={{ fontWeight: 800 }}>{s.title}</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                {s.text}
              </Typography>
            </Box>
            {i < JOIN_STEPS.length - 1 && (
              <Box aria-hidden="true" sx={{ color: colors.textMuted, display: 'grid', placeItems: 'center' }}>
                <Box sx={{ display: { xs: 'block', md: 'none' } }}>
                  <ArrowDown size={22} />
                </Box>
                <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                  <ArrowRight size={22} />
                </Box>
              </Box>
            )}
          </Box>
        ))}
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', my: 2.5 }}>
        <Box aria-hidden="true" sx={{ width: 2, height: 24, bgcolor: colors.border }} />
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, px: 2.5, py: 1.25, borderRadius: '999px', background: gradients.brand, color: colors.textOnDark, fontWeight: 700, boxShadow: shadows.md }}>
          <Split size={18} aria-hidden="true" />
          Join solo, or create a group?
        </Box>
        <Box aria-hidden="true" sx={{ width: 2, height: 24, bgcolor: colors.border }} />
      </Box>

      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3 }}>
        <Branch icon={User} branch={JOIN_BRANCHES.solo} />
        <Branch icon={Users} branch={JOIN_BRANCHES.group} highlight />
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: 2.5 }}>
        <Box aria-hidden="true" sx={{ width: 2, height: 24, bgcolor: colors.border }} />
        <Box sx={{ width: '100%', p: { xs: 2.5, md: 3 }, borderRadius: `${radii.lg}px`, bgcolor: colors.bgAlt, border: `1px solid ${colors.border}`, textAlign: 'center' }}>
          <Typography sx={{ fontWeight: 800, mb: 0.5 }}>Then, every day</Typography>
          <Typography color="text.secondary">
            Check in on your scheduled days. You get a reminder each morning, a kind nudge after a missed day, and every Sunday you get
            your weekly report and the top participants list is refreshed.
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}
