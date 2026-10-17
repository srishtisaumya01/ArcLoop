import { describe, expect, it, vi } from 'vitest'
import { ApiError, createApiClient } from '../../../src/services/api/apiClient.js'

const memory = (initial) => {
  const data = new Map(initial ? [['arcloop.session', JSON.stringify(initial)]] : [])
  return { getItem: (k) => data.get(k) ?? null, setItem: vi.fn((k, v) => data.set(k, v)), removeItem: vi.fn((k) => data.delete(k)), data }
}
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
const session = { token: 'tok-123', expiresAt: '2999-01-01T00:00:00Z', user: { id: 7, email: 'a@example.com' } }
const client = (fetchImpl, storage = memory(session)) => createApiClient({ baseUrl: 'http://api.test/api/v1/', fetchImpl, storage })

describe('apiClient', () => {
  it('sends the bearer token, JSON bodies and query parameters, and returns the parsed body', async () => {
    const fetchImpl = vi.fn(async () => reply(200, { results: [1] }))
    const result = await client(fetchImpl).post('/task-templates/', { title: 'x' }, { query: { a: 1, skip: undefined, none: null } })
    expect(result).toEqual({ results: [1] })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(String(url)).toBe('http://api.test/api/v1/task-templates/?a=1')
    expect(init).toMatchObject({ method: 'POST', body: '{"title":"x"}' })
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok-123', 'Content-Type': 'application/json' })
  })

  it('does not send a token for public calls and returns null for 204', async () => {
    const fetchImpl = vi.fn(async () => reply(204))
    expect(await client(fetchImpl).post('/auth/password/reset/', { email: 'a@b.c' }, { authenticated: false })).toBeNull()
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBeUndefined()
  })

  it('turns the API error shape into an ApiError with code, message and field errors', async () => {
    const fetchImpl = async () => reply(400, { error: { code: 'constraint_violation', message: 'Nope.', fields: { title: 'Too long' } } })
    await expect(client(fetchImpl).get('/x/')).rejects.toMatchObject({ name: 'ApiError', status: 400, code: 'constraint_violation', message: 'Nope.', fields: { title: 'Too long' } })
  })

  it('reports an unreachable server as status 0 without a code', async () => {
    const error = await client(async () => { throw new TypeError('Failed to fetch') }).get('/x/').catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect([error.status, error.code]).toEqual([0, undefined])
  })

  it('signs out locally and tells listeners when the server refuses the token', async () => {
    const storage = memory(session)
    const api = client(async () => reply(401, { error: { code: 'unauthenticated', message: 'Please log in again to continue.' } }), storage)
    const events = []
    api.subscribe((event, current) => events.push([event, current]))
    await expect(api.get('/profile/')).rejects.toMatchObject({ status: 401 })
    expect(events).toEqual([['SESSION_EXPIRED', null]])
    expect(api.getSession()).toBeNull()
    expect(storage.data.has('arcloop.session')).toBe(false)
  })

  it('refuses authenticated calls without a session, before touching the network', async () => {
    const fetchImpl = vi.fn()
    await expect(client(fetchImpl, memory(null)).get('/profile/')).rejects.toMatchObject({ status: 401, code: 'unauthenticated' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('stores the session after sign-in, restores it, and ignores expired or malformed stored data', () => {
    const storage = memory(null)
    const api = client(vi.fn(), storage)
    const seen = []
    api.subscribe((event) => seen.push(event))
    api.setSession({ token: 'abc', expires_at: '2999-01-01T00:00:00Z', user: { id: 1, email: 'x@y.z' } })
    expect(JSON.parse(storage.data.get('arcloop.session'))).toMatchObject({ token: 'abc', user: { id: 1 } })
    expect(client(vi.fn(), storage).getSession()).toMatchObject({ token: 'abc' })
    api.clearSession()
    expect(seen).toEqual(['SIGNED_IN', 'SIGNED_OUT'])
    expect(client(vi.fn(), memory({ ...session, expiresAt: '2000-01-01T00:00:00Z' })).getSession()).toBeNull()
    const broken = memory(null)
    broken.data.set('arcloop.session', '{not json')
    expect(client(vi.fn(), broken).getSession()).toBeNull()
  })

  it('keeps working in memory when storage is unavailable', () => {
    const storage = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => { throw new Error('blocked') } }
    const api = client(vi.fn(), storage)
    api.setSession({ token: 'abc', expires_at: null, user: { id: 1, email: 'x@y.z' } })
    expect(api.getSession()).toMatchObject({ token: 'abc' })
  })

  it('says so when no server address is configured', async () => {
    await expect(createApiClient({ baseUrl: '' }).get('/x/')).rejects.toMatchObject({ code: 'not_configured' })
  })
})
