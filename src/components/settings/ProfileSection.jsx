import { useState } from 'react'
import { Box, Button, TextField, Typography } from '@mui/material'
import SettingsSection from './SettingsSection.jsx'
import { useSectionSave } from './useSectionSave.js'
import { DISPLAY_NAME_MAX, detectDeviceTimeZone, timeZoneOptions } from '../../utils/profile.js'

// Display name and timezone. "Discard changes" returns to what is saved; the section says plainly
// whether there are unsaved edits.
export default function ProfileSection({ profile, userId, onSaved }) {
  const device = detectDeviceTimeZone()
  const savedName = profile.display_name ?? ''
  const [displayName, setDisplayName] = useState(savedName)
  const [timezone, setTimezone] = useState(profile.timezone)
  const { errors, message, saving, save, clearMessage, reset } = useSectionSave({ userId, onSaved })
  const options = timeZoneOptions({ current: profile.timezone, device })
  const dirty = displayName.trim() !== savedName || timezone !== profile.timezone

  const edit = (setter) => (e) => {
    setter(e.target.value)
    clearMessage()
  }
  const submit = (e) => {
    e.preventDefault()
    const changes = { displayName, timezone }
    return save(changes, (saved) => (saved.timezone === profile.timezone ? 'Saved.' : `Saved. Your day, week and reminders now follow ${saved.timezone}.`))
  }
  const discard = () => {
    setDisplayName(savedName)
    setTimezone(profile.timezone)
    reset()
  }

  return (
    <SettingsSection title="Profile" description="Your name and timezone." component="form" onSubmit={submit} noValidate aria-label="Profile">
      <TextField id="field-displayName" label="Display name (optional)" value={displayName} onChange={edit(setDisplayName)} error={Boolean(errors.displayName)} helperText={errors.displayName ?? `Up to ${DISPLAY_NAME_MAX} characters.`} />
      <Box sx={{ display: 'grid', gap: 1 }}>
        <TextField id="field-timezone" select label="Timezone" value={timezone} onChange={edit(setTimezone)} error={Boolean(errors.timezone)} helperText={errors.timezone} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
          {options.map((zone) => (
            <option key={zone} value={zone}>{zone}</option>
          ))}
        </TextField>
        {device && device !== timezone && (
          <Box>
            <Button size="small" variant="outlined" onClick={() => { setTimezone(device); clearMessage() }}>Use this device’s timezone ({device})</Button>
          </Box>
        )}
        <Typography variant="body2" color="text.secondary">
          Your timezone decides which date counts as today, where your week starts and ends, and when reminders arrive. Changing it does not rewrite your past records.
        </Typography>
      </Box>
      {dirty && !message && <Typography role="status" variant="body2">You have unsaved changes.</Typography>}
      {message && <Typography role="status">{message}</Typography>}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        <Button type="submit" variant="contained" disabled={saving || !dirty}>Save profile</Button>
        <Button variant="text" disabled={saving || !dirty} onClick={discard}>Discard changes</Button>
      </Box>
    </SettingsSection>
  )
}
