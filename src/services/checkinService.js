import { api, ApiError } from './api/apiClient.js'

// Daily check-in and check-out, and the streak they build. A day counts only when the person did both.
export const CHECKIN_CHANGED = 'arcloop:checkin-changed'
const changed = () => window.dispatchEvent(new Event(CHECKIN_CHANGED))

export const getCheckin = () => api.get('/checkin/')

async function act(path, fallback) {
  try {
    const result = await api.post(path)
    changed()
    return result
  } catch (error) {
    throw new Error(error instanceof ApiError && error.message ? error.message : fallback, { cause: error })
  }
}

export const checkIn = () => act('/checkin/start/', 'We could not check you in. Please try again.')
export const checkOut = () => act('/checkin/end/', 'We could not check you out. Please try again.')
