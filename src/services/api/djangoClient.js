import { ApiError } from './apiClient.js'
import { createQueryBuilder, shapeResult } from './queryBuilder.js'

// A client in the shape the planner and reminder services already use (`from(table).select()...`,
// `auth.getSession()`), backed by the Arcloop (Django) API instead of PostgREST. Those services keep their
// pure planner logic and their error handling untouched; only the data source changes.
//
// It translates exactly the query shapes the services use. Authorisation is the SERVER's job: every request
// is scoped to the signed-in user there, whatever filters are sent from here.

const RESOURCES = {
  task_templates: 'task-templates',
  day_plans: 'day-plans',
  task_occurrences: 'task-occurrences',
  reminder_preferences: 'reminder-preferences',
  task_reminders: 'task-reminders',
}
const IN_CHUNK = 100 // keeps request URLs short

// API error codes -> the SQLSTATE-style codes the services map to user-facing categories.
const CODE_MAP = {
  permission_denied: '42501',
  conflict: '23505',
  not_found: '23503', // the API only answers not_found for a reference that does not exist or is not the caller's
  constraint_violation: '23514',
  validation_error: '23514',
  date_rule: '22008',
  limit_reached: '54000',
}

function toError(error, table) {
  if (!(error instanceof ApiError)) throw error
  if (error.status === 0) return { name: 'TypeError', status: 0, message: error.message } // unreachable: the services call this a network error
  if (error.status === 401) return { code: 'PGRST301', status: 401, message: error.message }
  if (table === 'profiles' && error.fields?.timezone) return { code: '22023', message: error.message }
  if (table === 'profiles' && error.fields?.display_name) return { code: '23514', message: 'display_name violates the length rule' }
  return { code: CODE_MAP[error.code], status: error.status, message: error.message }
}

function filterParams(filters) {
  const query = {}
  const inFilters = []
  for (const { column, op, value } of filters) {
    if (op === 'in') inFilters.push({ column, value })
    else if (op === 'eq') query[column] = value
    else if (op === 'is') {
      if (value !== null) throw new Error('only .is(column, null) is supported')
      query[`${column}__isnull`] = 'true'
    } else query[`${column}__${op}`] = value
  }
  return { query, inFilters }
}

const orderParam = (order) => (order.length ? order.map((o) => `${o.ascending ? '' : '-'}${o.column}`).join(',') : undefined)

// "a, b" -> only those columns, like PostgREST's select list.
function project(rows, columns) {
  if (!columns || columns.trim() === '*') return rows
  const wanted = columns.split(',').map((c) => c.trim()).filter(Boolean)
  return rows.map((row) => Object.fromEntries(wanted.map((c) => [c, row[c] ?? null])))
}

export function createDjangoClient(api) {
  async function run(state) {
    const { table } = state
    if (table === 'profiles') return runProfile(state)
    const path = `/${RESOURCES[table] ?? (() => { throw new Error(`unknown table: ${table}`) })()}/`
    const { query, inFilters } = filterParams(state.filters)

    if (state.op === 'select') {
      const page = {}
      if (state.range) Object.assign(page, { limit: state.range[1] - state.range[0] + 1, offset: state.range[0] })
      else if (state.limit != null) page.limit = state.limit
      const base = { ...query, ...page, order: orderParam(state.order) }
      if (inFilters.length === 0) return (await api.get(path, { query: base })).results
      const [first, ...rest] = inFilters
      if (rest.length) throw new Error('only one .in() filter per query is supported')
      if (first.value.length === 0) return []
      const rows = []
      for (let i = 0; i < first.value.length; i += IN_CHUNK) {
        const chunk = first.value.slice(i, i + IN_CHUNK)
        rows.push(...(await api.get(path, { query: { ...base, [`${first.column}__in`]: chunk.join(',') } })).results)
      }
      return rows
    }
    if (inFilters.length) throw new Error('.in() is only supported when reading')
    if (state.op === 'insert') return (await api.post(path, state.payload)).results
    if (state.op === 'update') return (await api.patch(path, state.payload, { query })).results
    return (await api.delete(path, { query })).results
  }

  // One profile per user, addressed by the session: the API has no profile list.
  async function runProfile(state) {
    const session = api.getSession()
    if (state.op === 'select') {
      const row = await api.get('/profile/')
      const id = state.filters.find((f) => f.column === 'id' && f.op === 'eq')?.value
      return id !== undefined && String(id) !== String(row.id) ? [] : [row]
    }
    if (state.op !== 'update') throw new Error('profiles can only be read and updated')
    const id = state.filters.find((f) => f.column === 'id' && f.op === 'eq')?.value
    if (!session || (id !== undefined && String(id) !== String(session.user.id))) return [] // someone else's profile: nothing to change
    return [await api.patch('/profile/', state.payload)]
  }

  async function execute(state) {
    try {
      return shapeResult(project(await run(state), state.columns), state)
    } catch (error) {
      return { data: null, error: toError(error, state.table) }
    }
  }

  return {
    auth: {
      getSession: async () => {
        const session = api.getSession()
        return { data: { session: session ? { user: session.user } : null }, error: null }
      },
    },
    from: (table) => createQueryBuilder(table, execute),
  }
}
