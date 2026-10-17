import { useState } from 'react'
import { Box, Button, MenuItem, TextField, Typography } from '@mui/material'
import SettingsSection from './SettingsSection.jsx'
import { useSectionSave } from './useSectionSave.js'

const CHOICES = [
  { value: 'private', label: 'Private (only me)' },
  { value: 'public', label: 'Public' },
]

// Visibility choices stored on the profile. Everything starts private, and no feature shares data with
// other people yet; these choices are what future sharing features will respect.
export default function PrivacySection({ profile, userId, onSaved }) {
  const [profileVisibility, setProfileVisibility] = useState(profile.profile_visibility)
  const [progressVisibility, setProgressVisibility] = useState(profile.progress_visibility)
  const { errors, message, saving, save, clearMessage, reset } = useSectionSave({ userId, onSaved })
  const dirty = profileVisibility !== profile.profile_visibility || progressVisibility !== profile.progress_visibility

  const edit = (setter) => (e) => {
    setter(e.target.value)
    clearMessage()
  }
  const discard = () => {
    setProfileVisibility(profile.profile_visibility)
    setProgressVisibility(profile.progress_visibility)
    reset()
  }

  return (
    <SettingsSection
      title="Privacy"
      description="Nothing is shared with other people yet. These choices apply when sharing features arrive."
      component="form"
      onSubmit={(e) => {
        e.preventDefault()
        return save({ profileVisibility, progressVisibility })
      }}
      noValidate
      aria-label="Privacy"
    >
      <TextField select label="Profile visibility" value={profileVisibility} onChange={edit(setProfileVisibility)} error={Boolean(errors.profileVisibility)} helperText={errors.profileVisibility}>
        {CHOICES.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
      </TextField>
      <TextField select label="Progress visibility" value={progressVisibility} onChange={edit(setProgressVisibility)} error={Boolean(errors.progressVisibility)} helperText={errors.progressVisibility}>
        {CHOICES.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
      </TextField>
      {dirty && !message && <Typography role="status" variant="body2">You have unsaved changes.</Typography>}
      {message && <Typography role="status">{message}</Typography>}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        <Button type="submit" variant="contained" disabled={saving || !dirty}>Save privacy</Button>
        <Button variant="text" disabled={saving || !dirty} onClick={discard}>Discard changes</Button>
      </Box>
    </SettingsSection>
  )
}
