import { api, apiRoot, ApiError } from './api/apiClient.js'
import { PROFILE_CHANGED } from '../hooks/profileEvents.js'

// Account details beyond the profile row: the username and the profile picture. Errors carry user-safe messages.

const changed = () => window.dispatchEvent(new Event(PROFILE_CHANGED))

function failure(error, fallback) {
  if (error instanceof ApiError && error.fields) {
    const message = error.fields.username ?? error.fields.avatar
    if (message) return new Error(Array.isArray(message) ? message[0] : message)
  }
  return new Error(error instanceof ApiError && error.status === 0 ? error.message : fallback)
}

export async function updateUsername(username) {
  try {
    const profile = await api.patch('/profile/', { username: username.trim() })
    changed()
    return profile
  } catch (error) {
    throw failure(error, 'We could not change your username. Please try again.')
  }
}

// `blob` is the already shrunk picture (see utils/avatarImage.js).
export async function uploadAvatar(blob) {
  try {
    const profile = await api.put('/profile/avatar/', blob, { contentType: blob.type || 'image/jpeg' })
    changed()
    return profile
  } catch (error) {
    throw failure(error, 'We could not upload your picture. Please try again.')
  }
}

export async function removeAvatar() {
  try {
    await api.delete('/profile/avatar/')
    changed()
  } catch (error) {
    throw failure(error, 'We could not remove your picture. Please try again.')
  }
}

// The address of the picture; the version changes with every new picture so the browser fetches the fresh one.
export const avatarUrl = (version) => (version ? `${apiRoot}/profile/avatar/?v=${version}` : null)
