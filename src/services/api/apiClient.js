// The shared client for the Arcloop (Django) API. It owns three things and nothing else: where the API
// lives, the signed-in session (an opaque bearer token), and turning every failure into an ApiError.
// Components and services never call fetch or read the token directly.
//
// The token is kept in localStorage so a reload keeps the user signed in (the same trade-off the previous
// provider made). It is sent in an Authorization header, never a cookie, so there is no CSRF surface; the
// server stores only a hash of it and expires it. Nothing here is a secret: the API URL is public.

const STORAGE_KEY = 'arcloop.session'

// A failure from the API (or from reaching it). `status` 0 means the request never got an answer.
export class ApiError extends Error {
  constructor({ status = 0, code, message, fields } = {}) {
    super(message ?? 'Something went wrong. Please try again.')
    this.name = 'ApiError'
    this.status = status
    this.code = code // a stable string from the server (e.g. 'permission_denied'); undefined for network failures
    this.fields = fields
  }
}

function browserStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null // private mode or blocked storage: the session then lasts until the page closes
  }
}

export function createApiClient({ baseUrl, fetchImpl, storage = browserStorage() } = {}) {
  const root = typeof baseUrl === 'string' ? baseUrl.replace(/\/+$/, '') : ''
  const listeners = new Set()
  let memory = null
  let loaded = false

  const read = () => {
    if (loaded) return memory
    loaded = true
    try {
      const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null')
      memory = parsed && typeof parsed.token === 'string' && parsed.user?.id !== undefined && !isExpired(parsed) ? parsed : null
    } catch {
      memory = null
    }
    return memory
  }
  const isExpired = (session) => Boolean(session.expiresAt) && Date.parse(session.expiresAt) <= Date.now()
  const notify = (event) => listeners.forEach((fn) => fn(event, memory))
  const persist = () => {
    try {
      if (memory) storage?.setItem(STORAGE_KEY, JSON.stringify(memory))
      else storage?.removeItem(STORAGE_KEY)
    } catch {
      /* storage unavailable: keep the in-memory session */
    }
  }

  function setSession(payload) {
    memory = { token: payload.token, expiresAt: payload.expires_at ?? null, user: { id: payload.user.id, email: payload.user.email } }
    loaded = true
    persist()
    notify('SIGNED_IN')
  }

  function clearSession(event = 'SIGNED_OUT') {
    const had = read() !== null
    memory = null
    loaded = true
    persist()
    if (had) notify(event)
  }

  async function request(method, path, { query, body, authenticated = true } = {}) {
    if (!root) throw new ApiError({ code: 'not_configured', message: 'The server address is not configured.' })
    const url = new URL(`${root}${path}`, globalThis.location?.origin)
    for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined && value !== null) url.searchParams.append(key, String(value))
    const headers = { Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const session = authenticated ? read() : null
    if (authenticated && !session) throw new ApiError({ status: 401, code: 'unauthenticated', message: 'Please log in again to continue.' })
    if (session) headers.Authorization = `Bearer ${session.token}`

    let response
    try {
      response = await (fetchImpl ?? globalThis.fetch)(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    } catch {
      throw new ApiError({ status: 0, message: 'We could not reach the server. Check your connection and try again.' })
    }
    const payload = response.status === 204 ? null : await response.json().catch(() => null)
    if (response.ok) return payload
    const error = payload?.error
    if (response.status === 401 && session) clearSession('SESSION_EXPIRED') // the server no longer accepts this token
    throw new ApiError({ status: response.status, code: error?.code, message: error?.message, fields: error?.fields })
  }

  return {
    request,
    get: (path, options) => request('GET', path, options),
    post: (path, body, options) => request('POST', path, { ...options, body }),
    patch: (path, body, options) => request('PATCH', path, { ...options, body }),
    delete: (path, options) => request('DELETE', path, options),
    getSession: () => {
      const session = read()
      if (session && isExpired(session)) {
        clearSession('SESSION_EXPIRED')
        return null
      }
      return session
    },
    setSession,
    clearSession,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

// In development the API is assumed to be on the address `manage.py runserver` uses, so a fresh checkout works without
// configuration. Production builds, and tests, must set VITE_API_BASE_URL explicitly.
// Each variable is read by its static name so the bundler inlines only these two values, never the whole environment.
const rawBase = import.meta.env?.VITE_API_BASE_URL ?? (import.meta.env?.MODE === 'development' ? 'http://127.0.0.1:8000/api/v1' : undefined)
// A value copied from .env.example is a placeholder, not configuration.
export const isApiConfigured = typeof rawBase === 'string' && /^https?:\/\//.test(rawBase) && !/your-/i.test(rawBase)

// The one client the application uses.
export const api = createApiClient({ baseUrl: isApiConfigured ? rawBase : '' })
