import { describe, expect, it } from 'vitest'
import { EMPTY_STYLE_HASH, buildCsp, originOf, securityHeaders, toNginx } from '../../deploy/securityHeaders.js'
import { createHash } from 'node:crypto'

describe('frontend security headers', () => {
  const api = 'https://api.example.com'

  it('the empty-style hash really is the hash of the empty string', () => {
    expect(EMPTY_STYLE_HASH).toBe(`'sha256-${createHash('sha256').update('').digest('base64')}'`)
  })

  it('is strict: no unsafe directives, no wildcards, no data: or blob: sources, scripts only from the app', () => {
    const policy = buildCsp({ apiOrigin: api })
    expect(policy).not.toMatch(/unsafe-|\*|data:|blob:|https?:\/\/(?!api\.example\.com)/)
    const directives = Object.fromEntries(policy.split('; ').map((d) => [d.split(' ')[0], d.split(' ').slice(1)]))
    expect(directives['default-src']).toEqual(["'none'"])
    expect(directives['script-src']).toEqual(["'self'"])
    expect(directives['connect-src']).toEqual(["'self'", api])
    expect(directives['frame-ancestors']).toEqual(["'none'"])
    expect(directives['object-src']).toEqual(["'none'"])
    expect(directives['style-src']).toEqual(["'self'", EMPTY_STYLE_HASH]) // empty <style> elements only, never inline text
  })

  it('needs nothing but the app’s own origin when the API is served from it (the recommended layout)', () => {
    const policy = buildCsp({})
    expect(policy).toContain("connect-src 'self'; ")
    expect(policy).not.toMatch(/https?:/)
  })

  it('accepts a separate API origin only as an origin, never a path, a wildcard or another scheme', () => {
    expect(() => buildCsp({ apiOrigin: 'https://api.example.com/api/v1' })).toThrow()
    expect(() => buildCsp({ apiOrigin: '*' })).toThrow()
    expect(() => buildCsp({ apiOrigin: 'javascript:alert(1)' })).toThrow()
    expect(originOf('https://api.example.com/api/v1')).toBe(api)
  })

  it('adds the report endpoint and upgrade-insecure-requests only when asked', () => {
    expect(buildCsp({ apiOrigin: api })).not.toMatch(/report-uri|upgrade-insecure/)
    const policy = buildCsp({ apiOrigin: api, reportUri: `${api}/api/v1/csp-report/`, httpsOnly: true })
    expect(policy).toContain(`report-uri ${api}/api/v1/csp-report/`)
    expect(policy).toContain('upgrade-insecure-requests')
  })

  it('report-only mode uses the report-only header name and enforce mode the enforcing one', () => {
    expect(Object.keys(securityHeaders({ apiOrigin: api, mode: 'report-only' }))).toContain('Content-Security-Policy-Report-Only')
    const enforced = securityHeaders({ apiOrigin: api })
    expect(Object.keys(enforced)).toContain('Content-Security-Policy')
    expect(Object.keys(enforced)).not.toContain('Content-Security-Policy-Report-Only')
    expect(enforced['X-Content-Type-Options']).toBe('nosniff')
  })

  it('prints nginx add_header lines that carry every header, quote-safe', () => {
    const headers = securityHeaders({ httpsOnly: true })
    const lines = toNginx(headers).split('\n')
    expect(lines).toHaveLength(Object.keys(headers).length)
    for (const [line, [name, value]] of lines.map((l, i) => [l, Object.entries(headers)[i]])) expect(line).toBe(`add_header ${name} "${value}" always;`)
    expect(Object.values(headers).join('')).not.toMatch(/["$]/)
  })
})
