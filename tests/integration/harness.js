import { inject } from 'vitest'
import { createDjangoClient } from '../../src/services/api/djangoClient.js'
import { createPlannerService } from '../../src/services/planner/createPlannerService.js'
import { createBrowserLikeApi } from '../support/browserLikeApi.js'
import { uniqueEmail } from '../support/uniqueEmail.js'

// Helpers for the integration tests: the real frontend services, hooks and screens run against the real Arcloop
// Django API (started once by globalSetup.js) with a real SQLite database. Each test makes its own users, so test
// files can run in parallel. Replaces the earlier PGlite harness.
//
// "Now" is controlled per world: every request carries the world's clock in the test-only `X-Test-Now` header
// (honoured only by a server started for tests), so the server's date rules agree with the clock the services use.

export const apiBase = () => inject('apiBase')
export const PASSWORD = 'plum-ladder-orbit-42'

export function createWorld(iso) {
  const world = { clockIso: iso, users: new Map(), anonymous: null, base: apiBase() }
  const fetchImpl = (url, init = {}) => fetch(url, { ...init, headers: { ...init.headers, 'X-Test-Now': world.clockIso } })
  // Each user is a separate "browser": its own cookie jar, its own session cookie, its own CSRF secret.
  world.newApi = () => createBrowserLikeApi({ baseUrl: world.base, fetchImpl }).api
  world.anonymous = world.newApi()
  return world
}

export const useFixedClock = (world, iso) => {
  world.clockIso = iso
}
export const setClock = useFixedClock

// Registers a real account through the API, sets its profile timezone, and returns its id.
export async function createUser(world, email, timeZone = 'UTC') {
  const api = world.newApi()
  const unique = uniqueEmail(email.split('@')[0])
  api.setSession(await api.post('/auth/register/', { email: unique, password: PASSWORD, transport: 'cookie' }))
  if (timeZone !== 'UTC') await api.patch('/profile/', { timezone: timeZone })
  const id = api.getSession().user.id
  world.users.set(id, { api, email: unique })
  return id
}

// A new account with its own client and planner service, both reading the world's clock. What most tests need first.
export async function createPerson(world, email, timeZone = 'UTC') {
  const userId = await createUser(world, email, timeZone)
  const client = createTestClient(world, { getUserId: () => userId })
  return { userId, client, service: createPlannerService({ getClient: () => client, clock: () => Date.parse(world.clockIso) }) }
}

// A Supabase-shaped client for one user (`getUserId` returns null for an anonymous visitor), as the services expect.
export function createTestClient(world, { getUserId, hooks = {} }) {
  const current = () => {
    const id = getUserId()
    return (id !== null && id !== undefined && world.users.get(id)?.api) || world.anonymous
  }
  // The client resolves the user per call, so a test can switch users the way the old harness did.
  return createDjangoClient(
    {
      get: (...a) => current().get(...a),
      post: (...a) => current().post(...a),
      patch: (...a) => current().patch(...a),
      delete: (...a) => current().delete(...a),
      getSession: () => current().getSession(),
    },
    { before: hooks.before },
  )
}

// Direct API reads that bypass the services, for assertions on what the server holds. Always as the owner.
export async function listRows(world, userId, resource, query = {}) {
  const api = world.users.get(userId).api
  const rows = []
  for (let offset = 0; ; offset += 1000) {
    const { results } = await api.get(`/${resource}/`, { query: { ...query, limit: 1000, offset } })
    rows.push(...results)
    if (results.length < 1000) return rows
  }
}
export const countRows = async (world, userId, resource, query = {}) => (await listRows(world, userId, resource, query)).length
// The API resources behind the old table names.
export const RESOURCE = { task_templates: 'task-templates', day_plans: 'day-plans', task_occurrences: 'task-occurrences', reminder_preferences: 'reminder-preferences', task_reminders: 'task-reminders' }
