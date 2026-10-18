// The security headers the FRONTEND host must send with the app's HTML and assets. Static hosting cannot be told
// what to send from inside the app, so this module is the single definition: the tests serve the production build
// with exactly these headers (`npm run test:e2e:csp`), `npm run csp:print` prints them for pasting into a host's
// configuration (nginx, Netlify/Cloudflare `_headers`, ...), and docs/DEPLOYMENT.md explains each directive.
//
// The policy is strict on purpose: no 'unsafe-inline' and no 'unsafe-eval' anywhere. It works because the production
// build has no inline scripts, fonts are self-hosted files (the build never inlines assets as data: URLs), and
// MUI/Emotion add their styles with CSSOM insertRule() into <style> elements that are EMPTY when created.
//
// A browser still checks each <style> element, so style-src must allow those empty elements. It does so with the hash
// of the empty string (EMPTY_STYLE_HASH): that admits a <style> with no content and refuses any <style> that has
// content, so injected CSS text and inline style="..." markup stay blocked. (A nonce cannot do better on static hosting:
// it must be unguessable per response, and a fixed one is readable by anyone who loads the page.) This relies on Emotion
// running in production ("speedy") mode, which it does in `vite build`; the development server is not covered by it.
// If a future change needs a loosening, the browser test fails and the loosening must be argued for, not added to make
// the test pass.

// sha256 of the empty string, base64: the only inline <style> content the policy admits.
export const EMPTY_STYLE_HASH = "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='"

// `apiOrigin`: only when the API is on a DIFFERENT origin than the app. The recommended layout serves both from one origin
// (`/api/` routed to Django), and then the policy needs nothing beyond 'self'.
export function buildCsp({ apiOrigin, reportUri, httpsOnly = false } = {}) {
  if (apiOrigin !== undefined && apiOrigin !== null && !/^https?:\/\/[^/]+$/.test(apiOrigin)) throw new Error('apiOrigin must be just an origin, e.g. https://api.example.com')
  const directives = {
    'default-src': ["'none'"],
    'script-src': ["'self'"],
    'style-src': ["'self'", EMPTY_STYLE_HASH],
    'font-src': ["'self'"],
    'img-src': ["'self'"],
    'connect-src': ["'self'", ...(apiOrigin ? [apiOrigin] : [])],
    'manifest-src': ["'self'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'object-src': ["'none'"],
  }
  if (httpsOnly) directives['upgrade-insecure-requests'] = []
  if (reportUri) directives['report-uri'] = [reportUri]
  return Object.entries(directives).map(([name, values]) => [name, ...values].join(' ')).join('; ')
}

// `mode`: 'enforce' blocks violations; 'report-only' only reports them (start here on a real deployment).
export function securityHeaders({ apiOrigin, reportUri, mode = 'enforce', httpsOnly = false } = {}) {
  const name = mode === 'report-only' ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy'
  return {
    [name]: buildCsp({ apiOrigin, reportUri, httpsOnly }),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  }
}

// The origin (scheme://host[:port]) of a full API base URL such as https://api.example.com/api/v1.
export const originOf = (url) => new URL(url).origin
