// The shared client for the Arcloop (Django) API. It owns three things and nothing else: where the API lives, who is
// signed in (in memory), and turning every failure into an ApiError. Components and services never call fetch directly.
//
// Authentication is an HttpOnly session cookie set by the server. Script cannot read it, so this client never holds,
// stores or sends a credential: the browser attaches the cookie to same-origin requests by itself. Because it does,
// every request that changes data must also prove it came from this app, by echoing the CSRF cookie in a header (the
// server rejects it otherwise). The API is served from the same origin as the app (`/api/...`), so no CORS is involved.
//
// What the client remembers is only `{ user }` after a sign-in or a `/auth/me/` check, so screens can show who is signed
// in. Nothing is written to localStorage; a reload asks the server (`/auth/me/`) who the cookie belongs to.

// The names are the server's (config/settings.py); tests/integration/authContract.integration.test.js keeps them in step.
export const CSRF_COOKIE_NAME = 'arcloop_csrf'
export const CSRF_HEADER_NAME = 'X-CSRFToken'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
// The browser-side storage key of the earlier bearer-token design. Removed at start-up so no old token lingers.
const LEGACY_STORAGE_KEY = 'arcloop.session'

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

// The value of one cookie from a `document.cookie`-style string, or null.
export function readCookie(name, cookieString = globalThis.document?.cookie ?? '') {
  for (const part of cookieString.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return null
}

function forgetLegacyToken() {
  try {
    globalThis.localStorage?.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    /* storage unavailable: nothing to remove */
  }
}

// `csrfToken` returns the CSRF secret to echo; the default reads the cookie. Tests that have no browser pass their own.
export function createApiClient({ baseUrl, fetchImpl, csrfToken = () => readCookie(CSRF_COOKIE_NAME) } = {}) {
  const root = typeof baseUrl === 'string' ? baseUrl.replace(/\/+$/, '') : ''
  const listeners = new Set()
  let session = null // { user: { id, email, username } }

  const notify = (event) => listeners.forEach((fn) => fn(event, session))

  function setSession(payload) {
    session = { user: { id: payload.user.id, email: payload.user.email, username: payload.user.username ?? null } }
    notify('SIGNED_IN')
  }

  function clearSession(event = 'SIGNED_OUT') {
    const had = session !== null
    session = null
    if (had) notify(event)
  }

  async function request(method, path, { query, body, contentType } = {}) {
    if (!root) throw new ApiError({ code: 'not_configured', message: 'The server address is not configured.' })
    const url = new URL(`${root}${path}`, globalThis.location?.origin)
    for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined && value !== null) url.searchParams.append(key, String(value))
    const headers = { Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = contentType ?? 'application/json'
    if (!SAFE_METHODS.has(method)) {
      const token = csrfToken()
      if (token) headers[CSRF_HEADER_NAME] = token
    }

    let response
    try {
      response = await (fetchImpl ?? globalThis.fetch)(url, { method, headers, credentials: 'same-origin', body: body === undefined || contentType ? body : JSON.stringify(body) })
    } catch {
      throw new ApiError({ status: 0, message: 'We could not reach the server. Check your connection and try again.' })
    }
    const payload = response.status === 204 ? null : await response.json().catch(() => null)
    if (response.ok) return payload
    const error = payload?.error
    if (response.status === 401) clearSession('SESSION_EXPIRED') // the server no longer accepts the cookie (a no-op when nobody was signed in)
    throw new ApiError({ status: response.status, code: error?.code, message: error?.message, fields: error?.fields })
  }

  return {
    request,
    get: (path, options) => request('GET', path, options),
    post: (path, body, options) => request('POST', path, { ...options, body }),
    patch: (path, body, options) => request('PATCH', path, { ...options, body }),
    put: (path, body, options) => request('PUT', path, { ...options, body }),
    delete: (path, options) => request('DELETE', path, options),
    getSession: () => session,
    setSession,
    clearSession,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

// The API is on the same origin as the app: a reverse proxy routes `/api/` to Django in production, and the Vite dev and
// preview servers do the same in development (vite.config.js). So the default needs no configuration. A build for a
// different layout can set VITE_API_BASE_URL. In tests (MODE "test") nothing is configured unless a test says so.
// Each variable is read by its static name so the bundler inlines only these values, never the whole environment.
const rawBase = import.meta.env?.VITE_API_BASE_URL ?? (import.meta.env?.MODE === 'test' ? undefined : '/api/v1')
// A value copied from .env.example is a placeholder, not configuration.
export const isApiConfigured = typeof rawBase === 'string' && /^(https?:\/\/|\/)/.test(rawBase) && !/your-/i.test(rawBase)

forgetLegacyToken()

// Where the API lives (no trailing slash), for the few things the browser loads itself, such as the profile picture.
export const apiRoot = isApiConfigured ? rawBase.replace(/\/+$/, '') : ''

// The one client the application uses.
export const api = createApiClient({ baseUrl: isApiConfigured ? rawBase : '' })
