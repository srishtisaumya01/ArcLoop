import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../src/services/api/apiClient.js'
import { createDjangoClient } from '../../../src/services/api/djangoClient.js'
import { toServiceError } from '../../../src/services/planner/errors.js'

const fakeApi = (handlers = {}) => ({
  get: vi.fn(handlers.get ?? (async () => ({ results: [] }))),
  post: vi.fn(handlers.post ?? (async (_p, body) => ({ results: [].concat(body) }))),
  patch: vi.fn(handlers.patch ?? (async () => ({ results: [] }))),
  delete: vi.fn(handlers.delete ?? (async () => ({ results: [] }))),
  getSession: () => ({ user: { id: 7, email: 'a@example.com' } }),
})

describe('Django client', () => {
  it('turns reads into filtered, ordered, paged GETs and projects the selected columns', async () => {
    const api = fakeApi({ get: async () => ({ results: [{ id: 'a', title: 'x', extra: 1 }] }) })
    const { data, error } = await createDjangoClient(api)
      .from('task_occurrences').select('id, title').eq('plan_date', '2026-03-10').gte('completion', 0.5).is('notified_at', null).neq('plan_state', 'x')
      .order('created_at').order('id', { ascending: false }).range(10, 19)
    expect(error).toBeNull()
    expect(data).toEqual([{ id: 'a', title: 'x' }])
    expect(api.get).toHaveBeenCalledWith('/task-occurrences/', {
      query: { plan_date: '2026-03-10', completion__gte: 0.5, notified_at__isnull: 'true', plan_state__neq: 'x', limit: 10, offset: 10, order: 'created_at,-id' },
    })
  })

  it('maps tables to resources and supports limit', async () => {
    const api = fakeApi()
    const client = createDjangoClient(api)
    await client.from('task_templates').select('*').lte('starts_on', '2026-03-10').limit(5)
    await client.from('day_plans').select('plan_date')
    await client.from('reminder_preferences').select('enabled')
    await client.from('task_reminders').select('id')
    expect(api.get.mock.calls.map(([path]) => path)).toEqual(['/task-templates/', '/day-plans/', '/reminder-preferences/', '/task-reminders/'])
    expect(api.get.mock.calls[0][1].query).toMatchObject({ starts_on__lte: '2026-03-10', limit: 5 })
    await expect(createDjangoClient(api).from('secrets').select('*')).rejects.toThrow('unknown table')
  })

  it('splits long in() lists into short requests and answers an empty list without asking', async () => {
    const api = fakeApi({ get: async (_p, { query }) => ({ results: query.id__in.split(',').map((id) => ({ id })) }) })
    const ids = Array.from({ length: 250 }, (_, i) => `id${i}`)
    const { data } = await createDjangoClient(api).from('task_occurrences').select('id').in('id', ids)
    expect(api.get).toHaveBeenCalledTimes(3)
    expect(data.map((r) => r.id)).toEqual(ids)
    api.get.mockClear()
    expect((await createDjangoClient(api).from('task_occurrences').select('id').in('id', [])).data).toEqual([])
    expect(api.get).not.toHaveBeenCalled()
  })

  it('writes: insert posts the payload, update and delete carry their filters, and no select means no data', async () => {
    const api = fakeApi({ post: async (_p, body) => ({ results: [].concat(body).map((r) => ({ ...r, id: 'new' })) }), patch: async () => ({ results: [{ id: 'a', completion: 1 }] }), delete: async () => ({ results: [{ id: 'a' }] }) })
    const client = createDjangoClient(api)
    expect((await client.from('day_plans').insert({ plan_date: '2026-03-10' }).select('plan_date, id')).data).toEqual([{ plan_date: '2026-03-10', id: 'new' }])
    expect((await client.from('day_plans').insert({ plan_date: '2026-03-10' })).data).toBeNull()
    expect((await client.from('task_occurrences').update({ completion: 1 }).eq('id', 'a').select('id')).data).toEqual([{ id: 'a' }])
    expect(api.patch).toHaveBeenCalledWith('/task-occurrences/', { completion: 1 }, { query: { id: 'a' } })
    expect((await client.from('task_occurrences').delete().eq('id', 'a').select('id')).data).toEqual([{ id: 'a' }])
    expect(api.delete).toHaveBeenCalledWith('/task-occurrences/', { query: { id: 'a' } })
  })

  it('applies single() and maybeSingle() like PostgREST', async () => {
    const api = fakeApi({ get: async () => ({ results: [{ id: 1 }, { id: 2 }] }) })
    const many = await createDjangoClient(api).from('task_templates').select('id').maybeSingle()
    expect(many.error.code).toBe('PGRST116')
    const none = await createDjangoClient(fakeApi()).from('task_templates').select('id').maybeSingle()
    expect(none).toEqual({ data: null, error: null })
  })

  it('reads and updates the one profile through the session, never anyone else’s', async () => {
    const profile = { id: 7, display_name: null, timezone: 'UTC' }
    const api = fakeApi({ get: async () => profile, patch: async (_p, body) => ({ ...profile, ...body }) })
    const client = createDjangoClient(api)
    expect((await client.from('profiles').select('timezone').eq('id', 7).maybeSingle()).data).toEqual({ timezone: 'UTC' })
    expect((await client.from('profiles').select('id').eq('id', 8).maybeSingle()).data).toBeNull()
    expect((await client.from('profiles').update({ timezone: 'Asia/Kolkata' }).eq('id', 7).select('id, timezone')).data).toEqual([{ id: 7, timezone: 'Asia/Kolkata' }])
    expect((await client.from('profiles').update({ timezone: 'Asia/Kolkata' }).eq('id', 8).select('id')).data).toEqual([])
    expect(api.patch).toHaveBeenCalledTimes(1)
  })

  it('exposes the signed-in user the way the services read it', async () => {
    expect((await createDjangoClient(fakeApi()).auth.getSession()).data.session.user.id).toBe(7)
  })

  describe('errors reach the services as the same categories as before', () => {
    const failing = (apiError) => createDjangoClient(fakeApi({ get: async () => { throw apiError } })).from('task_templates').select('*')
    const category = async (apiError) => toServiceError((await failing(apiError)).error).code
    it.each([
      [new ApiError({ status: 403, code: 'permission_denied', message: 'No.' }), 'PERMISSION_DENIED'],
      [new ApiError({ status: 409, code: 'conflict', message: 'Dup.' }), 'CONFLICT'],
      [new ApiError({ status: 404, code: 'not_found', message: 'Missing.' }), 'NOT_FOUND'],
      [new ApiError({ status: 400, code: 'constraint_violation', message: 'Rule.' }), 'VALIDATION'],
      [new ApiError({ status: 400, code: 'date_rule', message: 'Too far.' }), 'VALIDATION'],
      [new ApiError({ status: 400, code: 'limit_reached', message: 'Too many.' }), 'VALIDATION'],
      [new ApiError({ status: 401, code: 'unauthenticated', message: 'Log in.' }), 'AUTH_REQUIRED'],
      [new ApiError({ status: 0, message: 'offline' }), 'NETWORK'],
      [new ApiError({ status: 500, code: 'server_error', message: 'Oops.' }), 'UNKNOWN'],
    ])('%#', async (apiError, expected) => {
      expect(await category(apiError)).toBe(expected)
    })

    it('keeps the server’s curated message for rule and limit errors', async () => {
      const { error } = await failing(new ApiError({ status: 400, code: 'limit_reached', message: 'Too many active tasks (limit 200).' }))
      expect(toServiceError(error).message).toBe('Too many active tasks (limit 200).')
    })

    it('lets programming errors surface instead of hiding them', async () => {
      await expect(createDjangoClient(fakeApi({ get: async () => { throw new Error('bug') } })).from('task_templates').select('*')).rejects.toThrow('bug')
    })
  })
})
