// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../../src/services/api/apiClient.js'
import { CSRF_COOKIE, CSRF_HEADER } from '../../e2e/support/stubApi.js'
import { manage } from './manage.js'

// The browser echoes the CSRF cookie in a header, and the server decides the names. The frontend (and the stand-in server
// the fast browser tests use) keep their own copies; a rename on one side would silently break every write.
describe('the cookie and CSRF names are the same on the server and in the frontend', () => {
  it('matches Django’s settings', () => {
    const run = manage('auth_contract')
    expect(run.status, run.stderr).toBe(0)
    const server = run.json()
    expect(CSRF_COOKIE_NAME).toBe(server.csrf_cookie)
    expect(CSRF_HEADER_NAME.toLowerCase()).toBe(server.csrf_header)
    expect(server.session_cookie).toBe('arcloop_session') // not read by the frontend (HttpOnly), asserted so a rename is a conscious act
  })

  it('is what the stub server in the fast browser tests uses too', () => {
    expect(CSRF_COOKIE).toBe(CSRF_COOKIE_NAME)
    expect(CSRF_HEADER).toBe(CSRF_HEADER_NAME.toLowerCase())
  })
})
