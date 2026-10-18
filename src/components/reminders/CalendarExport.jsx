import { useId, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Checkbox, FormControlLabel, Link, MenuItem, TextField, Typography } from '@mui/material'
import { Download } from 'lucide-react'
import FormError from '../auth/FormError.jsx'
import SettingsSection from '../settings/SettingsSection.jsx'
import { useCalendarExport } from '../../hooks/useCalendarExport.js'
import { ROUTES } from '../../constants/navigation.js'
import { ALERT_CHOICES, EXPORT_DAYS_CHOICES } from '../../utils/calendar/planCalendar.js'
import { formatDay } from '../planner/weekFormat.js'

// An empty string means "nothing selected" to the select, so "no alert" needs a value of its own.
const NO_ALERT = 'none'
const alertLabel = (minutes) => (minutes === null ? 'No alert' : minutes === 0 ? 'At the start' : `${minutes} minutes before`)
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// Takes the upcoming plan to a calendar app as an .ics file. It is a one-time copy, and an alert is a request to the calendar
// app: this card says both plainly instead of implying reminders that Arcloop cannot guarantee.
export default function CalendarExport() {
  const { status, result, error, exportPlan } = useCalendarExport()
  const [days, setDays] = useState(14)
  const [includeUntimed, setIncludeUntimed] = useState(false)
  const [alertMinutes, setAlertMinutes] = useState(null)
  const notesId = useId()

  return (
    <SettingsSection
      title="Add to a calendar"
      aria-label="Calendar export"
      description="Take your upcoming tasks to Google Calendar, Apple Calendar, Outlook or any calendar app that opens .ics files."
    >
      <Box component="form" noValidate onSubmit={(event) => { event.preventDefault(); exportPlan({ days, includeUntimed, alertMinutes }) }} sx={{ display: 'grid', gap: 2 }} aria-describedby={notesId}>
        <TextField select label="Days to include" value={days} onChange={(e) => setDays(Number(e.target.value))} sx={{ maxWidth: 320 }}>
          {EXPORT_DAYS_CHOICES.map((n) => <MenuItem key={n} value={n}>{`The next ${n} days`}</MenuItem>)}
        </TextField>
        <FormControlLabel
          control={<Checkbox checked={includeUntimed} onChange={(e) => setIncludeUntimed(e.target.checked)} />}
          label="Include tasks without a time, as all-day events"
        />
        <TextField select label="Calendar alert" value={alertMinutes ?? NO_ALERT} onChange={(e) => setAlertMinutes(e.target.value === NO_ALERT ? null : Number(e.target.value))} sx={{ maxWidth: 320 }} helperText="Only for tasks with a time.">
          {ALERT_CHOICES.map((m) => <MenuItem key={m ?? NO_ALERT} value={m ?? NO_ALERT}>{alertLabel(m)}</MenuItem>)}
        </TextField>
        <Box>
          <Button type="submit" variant="contained" startIcon={<Download size={18} aria-hidden="true" />} disabled={status === 'working'}>
            {status === 'working' ? 'Preparing…' : 'Download .ics file'}
          </Button>
        </Box>
      </Box>

      {status === 'done' && (
        <Box role="status" sx={{ display: 'grid', gap: 0.5 }}>
          <Typography sx={{ fontWeight: 600 }}>
            {result.eventCount === 0
              ? 'There was nothing to add for those days.'
              : `Saved ${result.filename}: ${plural(result.eventCount, 'event')} from ${formatDay(result.from)} to ${formatDay(result.to)}.`}
          </Typography>
          {result.untimedLeftOut > 0 && (
            <Typography variant="body2" color="text.secondary">{`${plural(result.untimedLeftOut, 'task')} without a time ${result.untimedLeftOut === 1 ? 'was' : 'were'} left out.`}</Typography>
          )}
          <Typography variant="body2" color="text.secondary">{`Times are in your Arcloop timezone (${result.timeZone}).`}</Typography>
        </Box>
      )}
      <FormError message={status === 'error' ? error?.message || 'We could not make the calendar file. Please try again.' : null} />

      <Box id={notesId} component="ul" sx={{ m: 0, pl: 3, display: 'grid', gap: 0.5 }}>
        <Typography component="li" variant="body2" color="text.secondary">
          This is a one-time copy: it does not stay up to date. After you change your plan, download a new file. Repeating tasks are written out day by day. Some calendar apps replace events they already have; others add copies.
        </Typography>
        <Typography component="li" variant="body2" color="text.secondary">
          Times follow your Arcloop timezone, which you can change in <Link component={RouterLink} to={ROUTES.settings}>Settings</Link>, and show in your calendar&rsquo;s own timezone.
        </Typography>
        <Typography component="li" variant="body2" color="text.secondary">
          An alert is a request to your calendar app. It decides whether and how to notify you: Arcloop cannot guarantee that a notification will appear.
        </Typography>
        <Typography component="li" variant="body2" color="text.secondary">
          The file holds your task titles and notes and is created on this device. Keep it private.
        </Typography>
      </Box>
    </SettingsSection>
  )
}
