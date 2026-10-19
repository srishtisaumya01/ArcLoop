import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Container, IconButton, Link } from '@mui/material'
import { ArrowRight, Flame, X } from 'lucide-react'
import { useChallengeClock } from '../../hooks/useChallengeClock.js'
import { useI18n } from '../../hooks/useI18n.js'
import { challengePath } from '../../constants/navigation.js'
import { colors, contentWidths, gradients } from '../../theme/tokens.js'

const DISMISS_KEY = 'arcloop.banner.dismissed'
const pad = (n) => String(n).padStart(2, '0')

const wasDismissed = () => {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

// A slim strip above the navbar on every page: which day of the featured challenge it is, and the countdown to its end.
export default function ChallengeBanner({ now }) {
  const { t } = useI18n()
  const live = useChallengeClock(now)
  const [hidden, setHidden] = useState(wasDismissed)
  if (!live || hidden) return null
  const { challenge, clock } = live
  const { parts } = clock
  const time = t('{days}d {hours}h {minutes}m {seconds}s', { days: parts.days, hours: pad(parts.hours), minutes: pad(parts.minutes), seconds: pad(parts.seconds) })

  const status =
    clock.status === 'live' ? (
      <>
        <b>{t('Day {day} of {total}', { day: clock.dayNumber, total: clock.totalDays })}</b>
        <Box component="span" aria-hidden="true" sx={{ display: { xs: 'none', sm: 'block' }, width: 96, height: 6, borderRadius: 3, bgcolor: 'rgba(255, 255, 255, 0.25)', overflow: 'hidden' }}>
          <Box sx={{ width: `${Math.round(clock.progress * 100)}%`, height: '100%', borderRadius: 3, background: gradients.accentText }} />
        </Box>
        <span>{t('{time} left', { time })}</span>
      </>
    ) : clock.status === 'upcoming' ? (
      <span>{t('Starts in {time}', { time })}</span>
    ) : (
      <b>{t('Challenge complete')}</b>
    )

  const dismiss = () => {
    setHidden(true)
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // Remembering the dismissal is a convenience only.
    }
  }

  return (
    <Box role="region" aria-label={t('Challenge countdown')} sx={{ background: gradients.brand, color: colors.textOnDark, py: 0.75 }}>
      <Container sx={{ maxWidth: `${contentWidths.page + 48}px !important`, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', columnGap: 2, rowGap: 0.25, fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums' }}>
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, color: colors.mint300, fontWeight: 700 }}>
            <Flame size={16} aria-hidden="true" />
            {t(challenge.title)}
          </Box>
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.5 }}>
            {status}
          </Box>
          <Link
            component={RouterLink}
            to={challengePath(challenge.slug)}
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minHeight: 32, color: colors.textOnDark, fontWeight: 700, textDecorationColor: 'rgba(255, 255, 255, 0.6)', '&:hover': { color: colors.mint300 } }}
          >
            {t('Join now')}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </Box>
        <IconButton aria-label={t('Dismiss')} onClick={dismiss} size="small" sx={{ color: colors.textOnDark, opacity: 0.85, '&:hover': { opacity: 1, bgcolor: 'rgba(255,255,255,0.14)' } }}>
          <X size={16} aria-hidden="true" />
        </IconButton>
      </Container>
    </Box>
  )
}
