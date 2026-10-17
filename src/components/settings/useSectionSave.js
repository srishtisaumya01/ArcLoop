import { useState } from 'react'
import { updateMyProfile } from '../../services/profileService.js'
import { notifyProfileChanged } from '../../hooks/profileEvents.js'

// Shared save behaviour for the editable Settings sections: one save call to the profile service,
// per-field errors, a status message, and a flag while saving. `onSaved(profile)` receives the row
// the database returned, so the page always shows what was really stored.
export function useSectionSave({ userId, onSaved }) {
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const clearMessage = () => setMessage('')
  async function save(changes, success = () => 'Saved.') {
    setSaving(true)
    setErrors({})
    setMessage('')
    try {
      const saved = await updateMyProfile(userId, changes)
      onSaved(saved)
      if ('timezone' in changes) notifyProfileChanged()
      setMessage(success(saved))
      return saved
    } catch (error) {
      if (error.fields) setErrors(error.fields)
      else setMessage(error.message)
      return null
    } finally {
      setSaving(false)
    }
  }
  return { errors, message, saving, save, clearMessage, reset: () => { setErrors({}); setMessage('') } }
}
