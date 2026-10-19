import { useCallback, useEffect, useRef, useState } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { Alert, Box, Button } from '@mui/material'
import { useAuth } from '../../hooks/useAuth.js'
import { notifyProfileChanged } from '../../hooks/profileEvents.js'
import { getMyTimezone, updateMyProfile } from '../../services/profileService.js'
import { detectDeviceTimeZone } from '../../utils/profile.js'
import { ROUTES } from '../../constants/navigation.js'
import { bottomNavClearance, colors, shadows } from '../../theme/tokens.js'

const key = (userId) => `arcloop.timezonePrompt.dismissed.${userId}`
const read = (userId) => {
  try {
    return localStorage.getItem(key(userId)) === '1'
  } catch {
    return false
  }
}

// New profiles start on UTC. When that is still the case but this device is somewhere else, offer
// (once, calmly) to use the device's timezone. A profile that was set to anything else is never
// second-guessed, and "Not now" is remembered per user in this browser.
export default function TimezonePrompt() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const device = detectDeviceTimeZone()
  const [current, setCurrent] = useState(null)
  const [dismissed, setDismissed] = useState(() => read(user.id))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const noticeRef = useRef(null)
  const visible = !(dismissed || pathname === ROUTES.settings || current !== 'UTC' || !device || device === 'UTC')

  // On a phone the card is fixed to the bottom of the screen. Tell the page how tall it is, so that keyboard focus scrolls a field
  // clear of it instead of leaving the field underneath (the theme's `scroll-padding-bottom` reads this).
  useEffect(() => {
    const node = noticeRef.current
    if (!visible || !node || !window.matchMedia?.('(max-width: 899.95px)').matches) return undefined
    const root = document.documentElement
    const publish = () => root.style.setProperty('--floating-notice-height', `${node.offsetHeight + 12}px`)
    publish()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish)
    observer?.observe(node)
    return () => {
      observer?.disconnect()
      root.style.removeProperty('--floating-notice-height')
    }
  }, [visible])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const zone = await getMyTimezone()
        if (!cancelled) setCurrent(zone)
      } catch {
        // Prompt is optional; stay quiet if the profile cannot be read.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user.id])

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(key(user.id), '1')
    } catch {
      // Remembering is a convenience only.
    }
    setDismissed(true)
  }, [user.id])

  async function useDevice() {
    setBusy(true)
    setError('')
    try {
      const saved = await updateMyProfile(user.id, { timezone: device })
      setCurrent(saved.timezone)
      notifyProfileChanged()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!visible) return null
  // A card outside the page flow. On wide screens it sits in the empty top-right of the header band and scrolls away with
  // the page, so it never covers a form; on phones it is fixed to the bottom of the screen.
  return (
    <Box ref={noticeRef} sx={{ position: { xs: 'fixed', md: 'absolute' }, left: { xs: 12, md: 'auto' }, right: { xs: 12, md: 24 }, bottom: { xs: `calc(${bottomNavClearance} + 12px)`, md: 'auto' }, top: { md: 12 }, zIndex: 1200, width: { md: 440 } }}>
      <Alert severity="info" role="region" aria-label="Timezone suggestion" sx={{ borderRadius: '14px', boxShadow: shadows.lg, border: `1px solid ${colors.border}`, bgcolor: colors.bgAlt, color: colors.textPrimary }}>
        Your timezone is set to UTC, but this device is in {device}. The right timezone keeps “today”, your week and your reminders on your clock.
        {error && <strong role="alert"> {error}</strong>}
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1, ml: -1 }}>
          <Button color="inherit" size="small" disabled={busy} onClick={useDevice}>Use {device}</Button>
          <Button color="inherit" size="small" component={RouterLink} to={ROUTES.settings}>Choose another</Button>
          <Button color="inherit" size="small" disabled={busy} onClick={dismiss}>Not now</Button>
        </Box>
      </Alert>
    </Box>
  )
}
