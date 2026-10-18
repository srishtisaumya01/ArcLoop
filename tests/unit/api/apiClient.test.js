import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, CSRF_COOKIE_NAME, CSRF_HEADER_NAME, createApiClient, readCookie } from '../../../src/services/api/apiClient.js'

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
const client = (fetchImpl, csrfToken = () => 'csrf-secret') => createApiClient({ baseUrl: 'http://api.test/api/v1/', fetchImpl, csrfToken })

describe('apiClient: cookie sessions', () => {
  it('sends the browser its own cookies and NO credential of its own: no Authorization header, ever', async () => {
    const fetchImpl = vi.fn(async () => reply(200, { results: [1] }))
    const api = client(fetchImpl)
    api.setSession({ user: { id: 1, email: 'a@example.com' } })
    expect(await api.post('/task-templates/', { title: 'x' }, { query: { a: 1, skip: undefined, none: null } })).toEqual({ results: [1] })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(String(url)).toBe('http://api.test/api/v1/task-templates/?a=1')
    expect(init).toMatchObject({ method: 'POST', body: '{"title":"x"}', credentials: 'same-origin' })
    expect(Object.keys(init.headers).map((h) => h.toLowerCase())).not.toContain('authorization')
  })

  it('echoes the CSRF secret on every request that changes data, and on no other', async () => {
    const fetchImpl = vi.fn(async () => reply(200, {}))
    const api = client(fetchImpl)
    await api.get('/a/')
    await api.post('/a/', {})
    await api.patch('/a/', {}, { query: { id: 1 } })
    await api.delete('/a/', { query: { id: 1 } })
    const headers = fetchImpl.mock.calls.map(([, init]) => [init.method, init.headers[CSRF_HEADER_NAME]])
    expect(headers).toEqual([['GET', undefined], ['POST', 'csrf-secret'], ['PATCH', 'csrf-secret'], ['DELETE', 'csrf-secret']])
  })

  it('sends no CSRF header when there is no secret yet (the server will refuse a write, which is the right answer)', async () => {
    const fetchImpl = vi.fn(async () => reply(204))
    await client(fetchImpl, () => null).post('/auth/logout/')
    expect(fetchImpl.mock.calls[0][1].headers[CSRF_HEADER_NAME]).toBeUndefined()
  })

  it('reads the CSRF secret from the page cookie by default, and never from storage', async () => {
    document.cookie = `${CSRF_COOKIE_NAME}=from%20cookie; path=/`
    const fetchImpl = vi.fn(async () => reply(200, {}))
    await createApiClient({ baseUrl: 'http://api.test', fetchImpl }).post('/x/', {})
    expect(fetchImpl.mock.calls[0][1].headers[CSRF_HEADER_NAME]).toBe('from cookie')
    document.cookie = `${CSRF_COOKIE_NAME}=; max-age=0; path=/`
  })

  it('turns the API error shape into an ApiError with code, message and field errors', async () => {
    const fetchImpl = async () => reply(400, { error: { code: 'constraint_violation', message: 'Nope.', fields: { title: 'Too long' } } })
    await expect(client(fetchImpl).get('/x/')).rejects.toMatchObject({ name: 'ApiError', status: 400, code: 'constraint_violation', message: 'Nope.', fields: { title: 'Too long' } })
  })

  it('reports a CSRF refusal as its own code so a screen can say what happened', async () => {
    const fetchImpl = async () => reply(403, { error: { code: 'csrf_failed', message: 'Your session could not be verified. Reload the page and try again.' } })
    await expect(client(fetchImpl).post('/x/', {})).rejects.toMatchObject({ status: 403, code: 'csrf_failed' })
  })

  it('reports an unreachable server as status 0 without a code', async () => {
    const error = await client(async () => { throw new TypeError('Failed to fetch') }).get('/x/').catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect([error.status, error.code]).toEqual([0, undefined])
  })

  it('says so when no server address is configured, before touching the network', async () => {
    const fetchImpl = vi.fn()
    await expect(createApiClient({ baseUrl: '', fetchImpl }).get('/x/')).rejects.toMatchObject({ code: 'not_configured' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('resolves a relative base (the same-origin `/api/v1`) against the page', async () => {
    const fetchImpl = vi.fn(async () => reply(200, {}))
    await createApiClient({ baseUrl: '/api/v1', fetchImpl }).get('/profile/')
    expect(String(fetchImpl.mock.calls[0][0])).toBe(`${window.location.origin}/api/v1/profile/`)
  })
})

describe('apiClient: the signed-in user lives in memory only', () => {
  it('holds { user } after sign-in, announces it, and clears it on sign-out', () => {
    const api = client(vi.fn())
    const seen = []
    api.subscribe((event, session) => seen.push([event, session]))
    api.setSession({ user: { id: 1, email: 'x@y.z', token: 'must-not-be-kept' }, token: 'must-not-be-kept' })
    expect(api.getSession()).toEqual({ user: { id: 1, email: 'x@y.z' } }) // only id and email survive
    api.clearSession()
    expect(api.getSession()).toBeNull()
    expect(seen).toEqual([['SIGNED_IN', { user: { id: 1, email: 'x@y.z' } }], ['SIGNED_OUT', null]])
  })

  it('writes nothing to localStorage or sessionStorage', async () => {
    const before = [localStorage.length, sessionStorage.length]
    const api = client(async () => reply(200, {}))
    api.setSession({ user: { id: 1, email: 'x@y.z' } })
    await api.get('/x/')
    api.clearSession()
    expect([localStorage.length, sessionStorage.length]).toEqual(before)
  })

  it('a 401 means the server dropped the session: the user is signed out and listeners are told once', async () => {
    const api = client(async () => reply(401, { error: { code: 'unauthenticated', message: 'Please log in again to continue.' } }))
    const events = []
    api.subscribe((event, current) => events.push([event, current]))
    api.setSession({ user: { id: 1, email: 'x@y.z' } })
    await expect(api.get('/profile/')).rejects.toMatchObject({ status: 401 })
    await expect(api.get('/profile/')).rejects.toMatchObject({ status: 401 })
    expect(api.getSession()).toBeNull()
    expect(events.map(([event]) => event)).toEqual(['SIGNED_IN', 'SESSION_EXPIRED']) // not announced again for the second 401
  })

  it('a 401 while nobody is signed in (a wrong password) announces nothing', async () => {
    const api = client(async () => reply(401, { error: { code: 'invalid_credentials', message: 'Email or password is incorrect.' } }))
    const listener = vi.fn()
    api.subscribe(listener)
    await expect(api.post('/auth/login/', {})).rejects.toMatchObject({ code: 'invalid_credentials' })
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('readCookie', () => {
  it('finds one cookie among several, decodes it, and does not match a longer name', () => {
    const jar = 'theme=dark; arcloop_csrf=a%2Fb%3Dc; arcloop_csrf_old=nope; other=1'
    expect(readCookie('arcloop_csrf', jar)).toBe('a/b=c')
    expect(readCookie('arcloop_csrf_old', jar)).toBe('nope')
    expect(readCookie('arcloop', jar)).toBeNull()
    expect(readCookie('missing', '')).toBeNull()
  })
})

describe('the old bearer-token design leaves nothing behind', () => {
  afterEach(() => {
    vi.resetModules()
    localStorage.clear()
  })

  it('removes a token an earlier version stored in this browser, the moment the client loads', async () => {
    localStorage.setItem('arcloop.session', JSON.stringify({ token: 'old-secret', user: { id: 1 } }))
    localStorage.setItem('keep-me', 'unrelated')
    vi.resetModules()
    await import('../../../src/services/api/apiClient.js')
    expect(localStorage.getItem('arcloop.session')).toBeNull()
    expect(localStorage.getItem('keep-me')).toBe('unrelated')
  })
})
