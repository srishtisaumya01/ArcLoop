import { useCallback, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Checkbox, Container, FormControlLabel, Skeleton, Switch, TextField, Typography } from '@mui/material'
import { Bell, RefreshCw, TriangleAlert } from 'lucide-react'
import PageHeader from '../../components/common/PageHeader.jsx'
import StatePanel from '../../components/common/StatePanel.jsx'
import { formatDay, weekdayName, weekdayShort } from '../../components/planner/weekFormat.js'
import { useAsync } from '../../hooks/useAsync.js'
import { notifyRemindersChanged } from '../../hooks/reminderEvents.js'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { reminderService } from '../../services/reminders/index.js'
import { permissionState, requestPermission } from '../../services/notifications/browserNotifications.js'
import { ROUTES } from '../../constants/navigation.js'
import { addDays, nextDailyReminder, upcomingTaskReminders } from '../../utils/planner/index.js'
import { colors, contentWidths, radii } from '../../theme/tokens.js'

const DAY_NUMBERS = [1, 2, 3, 4, 5, 6, 7]
// Monday 2026-03-02 .. Sunday 2026-03-08, only used to get day names.
const dayLabel = (n) => weekdayShort(addDays('2026-03-02', n - 1))
const daysSummary = (days) => (days.length === 7 ? 'every day' : days.map(dayLabel).join(', '))

const PERMISSION_COPY = {
  unsupported: 'This browser doesn’t support notifications. You’ll still see reminders inside Arcloop while it’s open.',
  default: 'Browser notifications are not allowed yet. If you’d like them, choose “Allow browser notifications”; your browser will ask once.',
  granted: 'Browser notifications are allowed for Arcloop.',
  denied: 'Notifications are blocked for this site in your browser. You can allow them in the browser’s site settings. Until then, reminders appear inside Arcloop.',
}

function Card({ title, children, ...rest }) {
  return (
    <Box component="section" {...rest} sx={{ p: 3, borderRadius: `${radii.lg}px`, border: `1px solid ${colors.border}`, bgcolor: colors.surface, display: 'grid', gap: 2 }}>
      <Typography variant="h3" component="h2">{title}</Typography>
      {children}
    </Box>
  )
}

function SettingsForm({ prefs, onSaved }) {
  const [enabled, setEnabled] = useState(prefs.enabled)
  const [time, setTime] = useState(prefs.remindTime)
  const [days, setDays] = useState(prefs.weekdays)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  async function run(action, success) {
    setSaving(true)
    setErrors({})
    setMessage('')
    try {
      const next = await action()
      notifyRemindersChanged()
      setMessage(success)
      onSaved(next)
      return next
    } catch (error) {
      if (error?.details?.fields) setErrors(error.details.fields)
      else setMessage(error?.message ?? 'That didn’t save. Please try again.')
      return null
    } finally {
      setSaving(false)
    }
  }

  const save = (e) => {
    e.preventDefault()
    return run(() => reminderService.savePreferences({ enabled, remindTime: time, weekdays: days }), 'Saved.')
  }
  async function reset() {
    const next = await run(() => reminderService.resetPreferences(), 'Reminder settings were reset. Reminders are off.')
    if (next) {
      setEnabled(next.enabled)
      setTime(next.remindTime)
      setDays(next.weekdays)
    }
  }
  const toggleDay = (n) => setDays((list) => (list.includes(n) ? list.filter((d) => d !== n) : [...list, n].sort((a, b) => a - b)))

  return (
    <Card title="Daily reminder" component="form" onSubmit={save} noValidate aria-label="Daily reminder settings">
      <FormControlLabel control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />} label={enabled ? 'Reminders are on' : 'Reminders are off'} />
      <TextField label="Reminder time" type="time" value={time} onChange={(e) => setTime(e.target.value)} error={Boolean(errors.remindTime)} helperText={errors.remindTime} slotProps={{ inputLabel: { shrink: true } }} sx={{ maxWidth: 220 }} />
      <Box role="group" aria-label="Days of the week">
        <Typography variant="body2" color="text.secondary">Remind me on</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
          {DAY_NUMBERS.map((n) => (
            <FormControlLabel key={n} control={<Checkbox checked={days.includes(n)} onChange={() => toggleDay(n)} />} label={dayLabel(n)} />
          ))}
        </Box>
        {errors.weekdays && <Typography variant="body2" color="error">{errors.weekdays}</Typography>}
      </Box>
      {errors.enabled && <Typography variant="body2" color="error">{errors.enabled}</Typography>}
      {message && <Typography role="status">{message}</Typography>}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        <Button type="submit" variant="contained" disabled={saving}>Save settings</Button>
        <Button variant="outlined" disabled={saving} onClick={reset}>Reset to defaults</Button>
      </Box>
    </Card>
  )
}

export default function ReminderSettingsPage() {
  usePageMeta('Reminders')
  const load = useCallback(async () => {
    const [prefs, context, reminders] = await Promise.all([reminderService.getPreferences(), reminderService.getContext(), reminderService.listTaskReminders()])
    return { prefs, context, reminders }
  }, [])
  const { status, data, retry } = useAsync(load)
  const [permission, setPermission] = useState(() => permissionState())
  const [saved, setSaved] = useState(null)
  const [removeError, setRemoveError] = useState('')

  const prefs = saved?.prefs ?? data?.prefs
  const reminders = saved?.reminders ?? data?.reminders ?? []
  const context = data?.context

  const afterSave = (next) => setSaved({ prefs: next, reminders })
  async function removeReminder(r) {
    setRemoveError('')
    try {
      await reminderService.removeTaskReminder(r.occurrenceId)
      setSaved({ prefs, reminders: reminders.filter((x) => x.id !== r.id) })
      notifyRemindersChanged()
    } catch (error) {
      setRemoveError(error?.message ?? 'That didn’t save. Please try again.')
    }
  }

  // The service reports the time it loaded at, so the page never reads the clock while rendering.
  const now = context?.now
  const nextDaily = prefs && context ? nextDailyReminder({ prefs, now, timeZone: context.timeZone }) : null
  const upcoming = prefs && context ? upcomingTaskReminders({ reminders, now, timeZone: context.timeZone }) : []

  return (
    <>
      <PageHeader eyebrow="Reminders" title="Reminders" description="Gentle nudges, only when you want them. Nothing is turned on for you." />
      <Container sx={{ maxWidth: `${contentWidths.page}px !important`, py: { xs: 4, md: 6 }, display: 'grid', gap: 3 }}>
        {status === 'loading' && (
          <Box aria-busy="true" aria-label="Loading reminders" sx={{ display: 'grid', gap: 2 }}>
            <Skeleton variant="rounded" height={60} />
            <Skeleton variant="rounded" height={220} />
          </Box>
        )}
        {status === 'error' && (
          <StatePanel tone="error" icon={TriangleAlert} title="We couldn’t load your reminders" text="Something went wrong while loading. Your plans are safe. Please try again."
            action={<Button variant="contained" startIcon={<RefreshCw size={18} aria-hidden="true" />} onClick={retry}>Try again</Button>} />
        )}
        {status === 'success' && prefs && (
          <>
            <Box role="status" aria-label="Reminder status" sx={{ p: 2.5, borderRadius: `${radii.md}px`, bgcolor: colors.bgAlt, border: `1px solid ${colors.border}` }}>
              <Typography sx={{ fontWeight: 700 }}>
                {prefs.enabled ? `Reminders are on: ${prefs.remindTime}, ${daysSummary(prefs.weekdays)}` : 'Reminders are off'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Times use your profile timezone ({context.timeZone}).
                {prefs.enabled && nextDaily ? ` Next daily reminder: ${weekdayName(nextDaily.date)} ${formatDay(nextDaily.date)} at ${nextDaily.time}.` : ''}
              </Typography>
            </Box>

            <SettingsForm key={`${prefs.enabled}|${prefs.remindTime}|${prefs.weekdays.join()}`} prefs={prefs} onSaved={afterSave} />

            <Card title="Browser notifications" aria-label="Browser notifications">
              <Typography>{PERMISSION_COPY[permission]}</Typography>
              {permission === 'default' && (
                <Box>
                  <Button variant="outlined" onClick={async () => setPermission(await requestPermission())}>Allow browser notifications</Button>
                </Box>
              )}
              <Typography variant="body2" color="text.secondary">
                Reminders are delivered while Arcloop is open in a browser tab. They can’t arrive when the tab or browser is closed, and some phone browsers only show them inside the page.
              </Typography>
            </Card>

            <Card title="Coming up" aria-label="Upcoming reminders">
              {removeError && <Typography role="alert" color="error">{removeError}</Typography>}
              {!prefs.enabled && upcoming.length > 0 && (
                <Typography variant="body2" color="text.secondary">Reminders are off, so these won’t be sent until you turn them on.</Typography>
              )}
              {upcoming.length === 0 && !(prefs.enabled && nextDaily) ? (
                <StatePanel icon={Bell} title="No reminders coming up" text="Turn on the daily reminder above, or choose “Remind me” on a task in My Day." action={<Button component={RouterLink} to={ROUTES.day} variant="outlined" size="small">Open My Day</Button>} />
              ) : (
                <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}>
                  {prefs.enabled && nextDaily && (
                    <Box component="li">
                      <Typography sx={{ fontWeight: 600 }}>Daily reminder</Typography>
                      <Typography variant="body2" color="text.secondary">{weekdayName(nextDaily.date)} {formatDay(nextDaily.date)} at {nextDaily.time}</Typography>
                    </Box>
                  )}
                  {upcoming.map((r) => (
                    <Box component="li" key={r.id} sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{r.title}</Typography>
                        <Typography variant="body2" color="text.secondary">{weekdayName(r.planDate)} {formatDay(r.planDate)} at {r.remindTime}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button size="small" component={RouterLink} to={`${ROUTES.day}?date=${r.planDate}`}>Open day</Button>
                        <Button size="small" color="error" onClick={() => removeReminder(r)} aria-label={`Remove reminder for ${r.title}`}>Remove</Button>
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </Card>
          </>
        )}
      </Container>
    </>
  )
}
