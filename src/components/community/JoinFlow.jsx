import { Box, Typography } from '@mui/material'
import { keyframes } from '@mui/material/styles'
import { Repeat, Split } from 'lucide-react'
import FlowConnector from './FlowConnector.jsx'
import Reveal from '../ui/Reveal.jsx'
import { useI18n } from '../../hooks/useI18n.js'
import { JOIN_STEPS } from '../../constants/communityDemo.js'
import { colors, gradients, radii, shadows } from '../../theme/tokens.js'

const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(46, 214, 139, 0.55); }
  70% { box-shadow: 0 0 0 16px rgba(46, 214, 139, 0); }
  100% { box-shadow: 0 0 0 0 rgba(46, 214, 139, 0); }
`
const spin = keyframes`
  to { transform: rotate(360deg); }
`
const noMotion = { '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }

function StepNumber({ n }) {
  return (
    <Box sx={{ width: 32, height: 32, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', background: gradients.brand, color: colors.textOnDark, fontWeight: 800, fontSize: '0.9375rem' }}>
      {n}
    </Box>
  )
}

// The join journey: three shared steps, the solo/group question, then `children` (the ways to join), then the daily loop.
export default function JoinFlow({ children }) {
  const { t } = useI18n()
  return (
    <Box>
      <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: 'stretch', gap: { xs: 0.5, md: 1 } }}>
        {JOIN_STEPS.map((s, i) => (
          <Box component="li" key={s.title} sx={{ flex: 1, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'stretch', md: 'center' }, gap: { xs: 0.5, md: 1 } }}>
            <Reveal delay={i * 140} sx={{ flex: 1 }}>
              <Box sx={{ height: '100%', p: 2.5, borderRadius: `${radii.md}px`, bgcolor: colors.surface, border: `1px solid ${colors.border}`, boxShadow: shadows.sm }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1 }}>
                  <StepNumber n={i + 1} />
                  <Typography sx={{ fontWeight: 800 }}>{t(s.title)}</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {t(s.text)}
                </Typography>
              </Box>
            </Reveal>
            {i < JOIN_STEPS.length - 1 && <FlowConnector delay={i * 0.5} />}
          </Box>
        ))}
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', my: 1 }}>
        <FlowConnector vertical delay={0.3} />
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, px: 2.5, py: 1.25, borderRadius: '999px', background: gradients.brand, color: colors.textOnDark, fontWeight: 700, animation: `${pulse} 2.2s ease-out infinite`, ...noMotion }}>
          <Split size={18} aria-hidden="true" />
          {t('Join solo, or create a group?')}
        </Box>
        <FlowConnector vertical delay={0.9} />
      </Box>

      {children}

      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: 1 }}>
        <FlowConnector vertical delay={0.6} />
        <Reveal sx={{ width: '100%' }}>
          <Box sx={{ p: { xs: 2.5, md: 3 }, borderRadius: `${radii.lg}px`, bgcolor: colors.surface, border: `1px solid ${colors.border}`, boxShadow: shadows.sm, display: 'flex', gap: 2, alignItems: 'center', flexDirection: { xs: 'column', sm: 'row' }, textAlign: { xs: 'center', sm: 'left' } }}>
            <Box sx={{ width: 48, height: 48, flexShrink: 0, borderRadius: '14px', display: 'grid', placeItems: 'center', background: gradients.brand, color: colors.textOnDark }}>
              <Box sx={{ display: 'flex', animation: `${spin} 6s linear infinite`, ...noMotion }}>
                <Repeat size={24} aria-hidden="true" />
              </Box>
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 800, mb: 0.5 }}>{t('Then, every day')}</Typography>
              <Typography color="text.secondary">
                {t('Check in on your scheduled days. You get a reminder each morning, a kind nudge after a missed day, and every Sunday you get your weekly report and the top participants list is refreshed.')}
              </Typography>
            </Box>
          </Box>
        </Reveal>
      </Box>
    </Box>
  )
}
