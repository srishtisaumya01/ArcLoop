import { CSRF_COOKIE_NAME, createApiClient } from '../../src/services/api/apiClient.js'
import { createCookieJar } from './cookieJar.js'

// The real API client, set up the way a browser sets it up: a cookie jar carries the HttpOnly session cookie, and the CSRF
// cookie is read from it to build the X-CSRFToken header. Node tests and scripts use this so they exercise the same
// cookie-and-CSRF sign-in as the app. `fetchImpl` lets a caller add headers (the integration harness adds the test clock).
export function createBrowserLikeApi({ baseUrl, fetchImpl = globalThis.fetch }) {
  const jar = createCookieJar(fetchImpl)
  return { jar, api: createApiClient({ baseUrl, fetchImpl: jar.fetch, csrfToken: () => jar.get(CSRF_COOKIE_NAME) }) }
}
