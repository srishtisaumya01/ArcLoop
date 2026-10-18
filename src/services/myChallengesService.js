import { api, ApiError } from './api/apiClient.js'

// The signed-in person's challenges, from the API: the list they can browse (and search), the ones they are in, making a
// custom challenge, and joining solo or with a group of friends. Errors carry user-safe messages; a group error also has
// `members`, the message for each listed friend by row.

export const CHALLENGES_CHANGED = 'arcloop:challenges-changed'
const changed = () => window.dispatchEvent(new Event(CHALLENGES_CHANGED))

function failure(error, fallback) {
  if (error instanceof ApiError) {
    if (error.status === 0) return new Error(error.message)
    const out = new Error(error.message || fallback)
    const members = error.fields?.members
    if (members && typeof members === 'object' && !Array.isArray(members)) out.members = members
    out.fields = error.fields
    return out
  }
  return new Error(fallback)
}

export async function listAppChallenges(query = '') {
  const { results } = await api.get('/challenges/', { query: { q: query.trim() || undefined } })
  return results
}

export async function getAppChallenge(slug) {
  try {
    return await api.get(`/challenges/${encodeURIComponent(slug)}/`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw failure(error, 'We could not load this challenge.')
  }
}

export async function listMyChallenges() {
  return api.get('/challenges/mine/') // { today, results }
}

export async function createCustomChallenge({ title, startDate, endDate, summary }) {
  try {
    const created = await api.post('/challenges/', { title, start_date: startDate, end_date: endDate, summary })
    changed()
    return created
  } catch (error) {
    throw failure(error, 'We could not create your challenge. Please try again.')
  }
}

// mode: 'solo', or 'group' with members [{ username, email }].
export async function enrollInChallenge(slug, { mode, members = [] }) {
  try {
    const enrolled = await api.post(`/challenges/${encodeURIComponent(slug)}/enroll/`, { mode, members })
    changed()
    return enrolled
  } catch (error) {
    throw failure(error, 'We could not join the challenge. Please try again.')
  }
}

export async function leaveChallenge(slug) {
  try {
    await api.delete(`/challenges/${encodeURIComponent(slug)}/leave/`)
    changed()
  } catch (error) {
    throw failure(error, 'We could not leave the challenge. Please try again.')
  }
}
