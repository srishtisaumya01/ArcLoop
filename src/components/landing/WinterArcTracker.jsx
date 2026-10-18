import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Container, Typography } from '@mui/material'
import { keyframes } from '@mui/material/styles'
import { ArrowRight, Radio } from 'lucide-react'
import Reveal from '../ui/Reveal.jsx'
import CountUp from '../ui/CountUp.jsx'
import { useChallengeClock } from '../../hooks/useChallengeClock.js'
import { useInView } from '../../hooks/useInView.js'
import { useI18n } from '../../hooks/useI18n.js'
import { challengePath } from '../../constants/navigation.js'
import { noMotion, popIn } from '../../theme/animations.js'
import { colors, contentWidths, gradients, onBrandButtons, radii, shadows } from '../../theme/tokens.js'

const pad = (n) => String(n).padStart(2, '0')

const beat = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.7); }
  70% { box-shadow: 0 0 0 10px rgba(255, 255, 255, 0); }
  100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
`

function TimeTile({ value, label }) {
  return (
    <Box sx={{ minWidth: { xs: 64, sm: 84 }, px: 1.5, py: 1.25, textAlign: 'center', borderRadius: `${radii.md}px`, bgcolor: 'rgba(255, 255, 255, 0.12)', border: '1px solid rgba(255, 255, 255, 0.28)', backdropFilter: 'blur(6px)' }}>
      <Typography component="div" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' }, fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
      <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.82)' }}>
        {label}
      </Typography>
    </Box>
  )
}

// One square for each day of the challenge: done, today (pulsing) and still to go. They pop in when scrolled into view.
function DayGrid({ clock }) {
  const { t } = useI18n()
  const [ref, play] = useInView({ threshold: 0.3 })
  const label = t('Day {day} of {total}: {done} days done, {left} days to go', { day: clock.dayNumber, total: clock.totalDays, done: Math.max(0, clock.dayNumber - 1), left: clock.daysLeft })
  return (
    <Box ref={ref}>
      <Box role="img" aria-label={label} sx={{ display: 'grid', gap: { xs: '5px', sm: '6px' }, gridTemplateColumns: { xs: 'repeat(10, 1fr)', md: 'repeat(15, 1fr)' } }}>
        {Array.from({ length: clock.totalDays }, (_, i) => {
          const day = i + 1
          const state = day < clock.dayNumber ? 'done' : day === clock.dayNumber ? 'today' : 'todo'
          return (
            <Box
              key={day}
              aria-hidden="true"
              title={t('Day {day} of {total}', { day, total: clock.totalDays })}
              sx={{
                aspectRatio: '1',
                borderRadius: '5px',
                bgcolor: state === 'done' ? colors.mint300 : state === 'today' ? '#ffffff' : 'rgba(255, 255, 255, 0.16)',
                opacity: play ? 1 : 0,
                animation: play ? `${popIn} 420ms ease ${Math.min(day, 90) * 14}ms both${state === 'today' ? `, ${beat} 1.8s ease-out 1.6s infinite` : ''}` : 'none',
                ...noMotion,
              }}
            />
          )
        })}
      </Box>
      <Box sx={{ mt: 2, display: 'flex', gap: 2.5, flexWrap: 'wrap', color: 'rgba(255, 255, 255, 0.9)', fontSize: '0.875rem' }}>
        {[
          ['done', t('Done')],
          ['today', t('Today')],
          ['todo', t('To go')],
        ].map(([state, text]) => (
          <Box key={state} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
            <Box aria-hidden="true" sx={{ width: 12, height: 12, borderRadius: '4px', bgcolor: state === 'done' ? colors.mint300 : state === 'today' ? '#fff' : 'rgba(255, 255, 255, 0.3)' }} />
            {text}
          </Box>
        ))}
      </Box>
    </Box>
  )
}

// The home page's challenge tracker: today's day number, the countdown to the end and a square for every day.
export default function WinterArcTracker({ now }) {
  const { t } = useI18n()
  const live = useChallengeClock(now)
  if (!live) return null
  const { challenge, clock } = live
  const { parts } = clock
  const left = clock.status === 'live' ? (clock.daysLeft === 0 ? t('Last day today') : t('{count} days left', { count: clock.daysLeft })) : null

  return (
    <Box component="section" aria-labelledby="tracker-title" sx={{ py: { xs: 5, md: 7 } }}>
      <Container sx={{ maxWidth: `${contentWidths.page}px !important` }}>
        <Reveal>
          <Box
            sx={{
              display: 'grid',
              gap: { xs: 4, md: 6 },
              gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1.05fr)' },
              alignItems: 'center',
              p: { xs: 3, md: 6 },
              borderRadius: `${radii.lg}px`,
              background: gradients.brand,
              color: colors.textOnDark,
              boxShadow: shadows.lg,
            }}
          >
            <Box>
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, mb: 2, px: 1.5, py: 0.5, borderRadius: '999px', bgcolor: 'rgba(255, 255, 255, 0.14)', color: colors.mint300, fontWeight: 700, fontSize: '0.8125rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                <Radio size={14} aria-hidden="true" />
                {clock.status === 'live' ? t('Live now') : clock.status === 'upcoming' ? t('Starting soon') : t('Completed')}
              </Box>
              <Typography variant="h2" component="h2" id="tracker-title" sx={{ mb: 1 }}>
                {t(challenge.title)}
              </Typography>
              <Typography sx={{ color: 'rgba(255, 255, 255, 0.86)', mb: 3 }}>{t(challenge.scheduleLabel)}</Typography>

              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mb: 1 }}>
                <Typography component="span" sx={{ fontSize: '1.125rem', fontWeight: 700, color: colors.mint300 }}>
                  {t('Day')}
                </Typography>
                <Typography component="span" sx={{ fontSize: { xs: '4rem', md: '5.5rem' }, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>
                  <CountUp value={clock.dayNumber} />
                </Typography>
                <Typography component="span" sx={{ fontSize: '1.5rem', fontWeight: 700, color: 'rgba(255, 255, 255, 0.86)' }}>
                  {t('of {total}', { total: clock.totalDays })}
                </Typography>
              </Box>
              {left && (
                <Typography sx={{ fontWeight: 700, mb: 3, color: colors.mint300 }}>{left}</Typography>
              )}

              {clock.status !== 'ended' && (
                <Box role="timer" aria-label={t('Time left in the challenge')} sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 4 }}>
                  <TimeTile value={parts.days} label={t('Days')} />
                  <TimeTile value={pad(parts.hours)} label={t('Hours')} />
                  <TimeTile value={pad(parts.minutes)} label={t('Minutes')} />
                  <TimeTile value={pad(parts.seconds)} label={t('Seconds')} />
                </Box>
              )}

              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Button component={RouterLink} to={`${challengePath(challenge.slug)}#join`} variant="contained" size="large" endIcon={<ArrowRight size={18} />} sx={onBrandButtons.solid}>
                  {t('Join this challenge')}
                </Button>
                <Button component={RouterLink} to={challengePath(challenge.slug)} variant="outlined" size="large" sx={onBrandButtons.glass}>
                  {t('See challenge details')}
                </Button>
              </Box>
            </Box>

            <DayGrid clock={clock} />
          </Box>
        </Reveal>
      </Container>
    </Box>
  )
}
