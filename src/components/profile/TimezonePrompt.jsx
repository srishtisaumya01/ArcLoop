import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { Alert, Button } from '@mui/material'
import { useAuth } from '../../hooks/useAuth.js'
import { notifyProfileChanged } from '../../hooks/profileEvents.js'
import { getMyTimezone, updateMyProfile } from '../../services/profileService.js'
import { detectDeviceTimeZone } from '../../utils/profile.js'
import { ROUTES } from '../../constants/navigation.js'

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

  if (dismissed || pathname === ROUTES.profile || current !== 'UTC' || !device || device === 'UTC') return null
  return (
    <Alert severity="info" role="region" aria-label="Timezone suggestion" sx={{ borderRadius: 0 }}
      action={
        <>
          <Button color="inherit" size="small" disabled={busy} onClick={useDevice}>Use {device}</Button>
          <Button color="inherit" size="small" component={RouterLink} to={ROUTES.profile}>Choose another</Button>
          <Button color="inherit" size="small" disabled={busy} onClick={dismiss}>Not now</Button>
        </>
      }>
      Your timezone is set to UTC, but this device is in {device}. The right timezone keeps “today”, your week and your reminders on your clock.
      {error && <strong role="alert"> {error}</strong>}
    </Alert>
  )
}
