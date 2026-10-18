import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Typography } from '@mui/material'
import { keyframes } from '@mui/material/styles'
import { ArrowRight, Check, CircleCheck, Sprout, Users } from 'lucide-react'
import { Section, SectionHeading } from '../ui/Section.jsx'
import Reveal from '../ui/Reveal.jsx'
import FlowConnector from '../community/FlowConnector.jsx'
import { useInView } from '../../hooks/useInView.js'
import { useI18n } from '../../hooks/useI18n.js'
import { HOW_IT_WORKS } from '../../constants/landingContent.js'
import { floatY, noMotion, popIn } from '../../theme/animations.js'
import { ROUTES } from '../../constants/navigation.js'
import { colors, gradients, radii, shadows } from '../../theme/tokens.js'

const ICONS = { sprout: Sprout, check: CircleCheck, users: Users }

const tickLoop = keyframes`
  0%, 8% { background-color: transparent; border-color: ${colors.textMuted}; }
  18%, 78% { background-color: ${colors.mint400}; border-color: ${colors.mint400}; }
  90%, 100% { background-color: transparent; border-color: ${colors.textMuted}; }
`
const tickMark = keyframes`
  0%, 8% { opacity: 0; transform: scale(0.4); }
  18%, 78% { opacity: 1; transform: none; }
  90%, 100% { opacity: 0; transform: scale(0.4); }
`

const HABITS = ['Walk 20 minutes', 'Read 10 pages', 'Plan the week']
const CHECKINS = ['Morning walk', 'Read 10 pages', 'Weekly review']
const FRIENDS = ['A', 'M', 'K', 'R']

// A small looping picture for each step. `play` starts the motion once the card has scrolled into view.
function PickVisual({ play }) {
  const { t } = useI18n()
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {HABITS.map((h, i) => (
        <Box
          key={h}
          sx={{
            px: 1.5,
            py: 0.75,
            borderRadius: '999px',
            bgcolor: colors.bgAlt,
            border: `1px solid ${colors.border}`,
            fontWeight: 600,
            fontSize: '0.875rem',
            opacity: play ? 1 : 0,
            animation: play ? `${popIn} 500ms ease ${i * 160}ms both` : 'none',
            ...noMotion,
          }}
        >
          {t(h)}
        </Box>
      ))}
    </Box>
  )
}

function CheckVisual({ play }) {
  const { t } = useI18n()
  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      {CHECKINS.map((c, i) => (
        <Box key={c} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, opacity: play ? 1 : 0, transition: `opacity 400ms ease ${i * 150}ms` }}>
          <Box
            sx={{
              width: 22,
              height: 22,
              flexShrink: 0,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              border: `2px solid ${colors.textMuted}`,
              color: colors.textOnDark,
              animation: play ? `${tickLoop} 6s ease-in-out ${i * 1.1}s infinite` : 'none',
              ...noMotion,
            }}
          >
            <Box component="span" sx={{ display: 'flex', animation: play ? `${tickMark} 6s ease-in-out ${i * 1.1}s infinite` : 'none', ...noMotion }}>
              <Check size={14} strokeWidth={3} />
            </Box>
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t(c)}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}

function FriendsVisual({ play }) {
  const { t } = useI18n()
  return (
    <Box sx={{ display: 'flex', alignItems: 'center' }}>
      {FRIENDS.map((f, i) => (
        <Box
          key={f}
          sx={{
            width: 40,
            height: 40,
            ml: i ? -1.25 : 0,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            background: gradients.brand,
            color: colors.textOnDark,
            fontWeight: 800,
            border: `3px solid ${colors.surface}`,
            opacity: play ? 1 : 0,
            animation: play ? `${popIn} 500ms ease ${i * 170}ms both, ${floatY} 4s ease-in-out ${i * 0.4}s infinite` : 'none',
            ...noMotion,
          }}
        >
          {f}
        </Box>
      ))}
      <Typography variant="body2" sx={{ ml: 1.5, fontWeight: 600, color: colors.textSecondary }}>
        {t('Your group')}
      </Typography>
    </Box>
  )
}

const VISUALS = { sprout: PickVisual, check: CheckVisual, users: FriendsVisual }

function StepCard({ step, index, last }) {
  const { t } = useI18n()
  const [ref, play] = useInView({ threshold: 0.3 })
  const Icon = ICONS[step.icon]
  const Visual = VISUALS[step.icon]
  return (
    <Reveal as="li" delay={index * 140} sx={{ position: 'relative', listStyle: 'none', minWidth: 0 }}>
      <Box
        ref={ref}
        sx={{
          position: 'relative',
          height: '100%',
          overflow: 'hidden',
          bgcolor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: `${radii.lg}px`,
          boxShadow: shadows.sm,
          p: { xs: 3, md: 3.5 },
          transition: 'transform 240ms cubic-bezier(0.2, 0.7, 0.2, 1), box-shadow 240ms',
          '&:hover': { transform: 'translateY(-6px)', boxShadow: shadows.lg },
          '&:hover .step-icon': { transform: 'scale(1.08) rotate(-5deg)' },
        }}
      >
        <Box aria-hidden="true" sx={{ position: 'absolute', inset: '0 0 auto 0', height: 5, background: gradients.brand }} />
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
          <Box className="step-icon" sx={{ width: 52, height: 52, borderRadius: '16px', display: 'grid', placeItems: 'center', background: gradients.brand, color: colors.textOnDark, transition: 'transform 240ms cubic-bezier(0.2, 0.7, 0.2, 1)' }}>
            <Icon size={26} aria-hidden="true" />
          </Box>
          <Typography variant="overline" component="p" sx={{ color: colors.blue600, m: 0 }}>
            {t('Step {n}', { n: index + 1 })}
          </Typography>
        </Box>
        <Typography variant="h3" component="h3" sx={{ mb: 1.5 }}>
          {t(step.title)}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {t(step.text)}
        </Typography>
        <Box aria-hidden="true" sx={{ p: 2, borderRadius: `${radii.md}px`, bgcolor: colors.bg, border: `1px dashed ${colors.border}`, minHeight: 112, display: 'flex', alignItems: 'center' }}>
          <Box sx={{ width: '100%' }}>
            <Visual play={play} />
          </Box>
        </Box>
      </Box>
      {!last && (
        <Box
          aria-hidden="true"
          sx={{
            position: 'absolute',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: { xs: 2, md: 40 },
            height: { xs: 40, md: 2 },
            left: { xs: 'calc(50% - 1px)', md: 'auto' },
            bottom: { xs: -40, md: 'auto' },
            right: { md: -40 },
            top: { md: '50%' },
          }}
        >
          <FlowConnector delay={index * 0.6} />
        </Box>
      )}
    </Reveal>
  )
}

export default function HowItWorks() {
  const { t } = useI18n()
  return (
    <Section id="how-it-works">
      <Reveal>
        <SectionHeading
          eyebrow={t('How it works')}
          title={t('Three simple steps to a steadier you')}
          description={t('No complicated setup. Start with one habit and build from there.')}
        />
      </Reveal>
      <Box component="ol" sx={{ m: 0, p: 0, display: 'grid', gap: '40px', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
        {HOW_IT_WORKS.map((step, i) => (
          <StepCard key={step.title} step={step} index={i} last={i === HOW_IT_WORKS.length - 1} />
        ))}
      </Box>
      <Reveal delay={200}>
        <Button component={RouterLink} to={ROUTES.howItWorks} variant="contained" color="primary" endIcon={<ArrowRight size={18} />} sx={{ mt: 5 }}>
          {t('See the full walkthrough')}
        </Button>
      </Reveal>
    </Section>
  )
}
