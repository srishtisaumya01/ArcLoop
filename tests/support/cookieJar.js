// A minimal cookie jar for Node, standing in for the one every browser has, so tests and scripts that have no browser can
// use the real cookie-and-CSRF sign-in. It stores name=value from Set-Cookie, sends them back, and drops a cookie the
// server expires (Max-Age=0 or a past Expires). It is NOT a general implementation: it ignores Path, Domain, Secure and
// SameSite, which the browser suites (e2e-django) exercise for real instead.
const expired = (attributes) => {
  const maxAge = attributes.find((a) => /^max-age=/i.test(a))
  if (maxAge && Number(maxAge.split('=')[1]) <= 0) return true
  const expires = attributes.find((a) => /^expires=/i.test(a))
  return Boolean(expires) && Date.parse(expires.slice(expires.indexOf('=') + 1)) <= Date.now()
}

export function createCookieJar(baseFetch = globalThis.fetch) {
  const cookies = new Map()
  const jarFetch = async (url, init = {}) => {
    const headers = { ...init.headers }
    if (cookies.size) headers.Cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
    const response = await baseFetch(url, { ...init, headers })
    for (const line of response.headers.getSetCookie?.() ?? []) {
      const [pair, ...attributes] = line.split(';').map((part) => part.trim())
      const at = pair.indexOf('=')
      const name = pair.slice(0, at)
      if (expired(attributes)) cookies.delete(name)
      else cookies.set(name, pair.slice(at + 1))
    }
    return response
  }
  return { fetch: jarFetch, get: (name) => cookies.get(name) ?? null, has: (name) => cookies.has(name) }
}
