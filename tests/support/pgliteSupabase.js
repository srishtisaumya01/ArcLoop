import { asUser } from '../db/harness.js'
import { createQueryBuilder, shapeResult } from './queryBuilder.js'

// A supabase-js-shaped client that runs each query as real SQL in PGlite, under the
// `authenticated` role with the signed-in user's id (or `anon` when nobody is signed in), so
// the REAL migration's RLS policies, column grants, triggers and constraints apply.
//
// It is a test adapter, NOT PostgREST and NOT Supabase: it translates only the query shapes the
// planner service uses, and it returns rows the way PostgREST would (jsonb, so dates are
// 'YYYY-MM-DD', times 'HH:MM:SS', numeric is a JSON number). Database errors come back as
// { error: { code: <SQLSTATE>, message } } like supabase-js.

const IDENT = /^[a-z_][a-z0-9_]*$/
const TABLES = new Set(['profiles', 'task_templates', 'day_plans', 'task_occurrences', 'reminder_preferences', 'task_reminders'])
const OPERATORS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }

const ident = (name) => {
  if (!IDENT.test(name)) throw new Error(`unsafe identifier in test adapter: ${name}`)
  return name
}
const columnList = (columns) => (columns.trim() === '*' ? '*' : columns.split(',').map((c) => ident(c.trim())).join(', '))
// Arrays go to Postgres as array literals (smallint[] / uuid[] columns).
const toParam = (v) => (Array.isArray(v) ? `{${v.join(',')}}` : v)

function buildWhere(filters, params) {
  const parts = filters.map(({ column, op, value }) => {
    ident(column)
    if (op === 'is') return value === null ? `${column} is null` : `${column} is not distinct from $${params.push(toParam(value))}`
    if (op === 'in') {
      if (value.length === 0) return 'false'
      return `${column} in (${value.map((v) => `$${params.push(toParam(v))}`).join(', ')})`
    }
    return `${column} ${OPERATORS[op]} $${params.push(toParam(value))}`
  })
  return parts.length ? `where ${parts.join(' and ')}` : ''
}

export function createPgliteClient(db, { getUserId, hooks = {} }) {
  const log = []

  async function run(state) {
    if (!TABLES.has(state.table)) throw new Error(`unknown table in test adapter: ${state.table}`)
    const params = []
    const returning = columnList(state.columns)
    let sql
    if (state.op === 'select') {
      const where = buildWhere(state.filters, params)
      const order = state.order.length ? `order by ${state.order.map((o) => `${ident(o.column)} ${o.ascending ? 'asc' : 'desc'}`).join(', ')}` : ''
      let page = ''
      if (state.range) page = `limit ${state.range[1] - state.range[0] + 1} offset ${state.range[0]}`
      else if (state.limit != null) page = `limit ${Number(state.limit)}`
      sql = `select to_jsonb(t) as j from (select ${returning} from public.${state.table} ${where} ${order} ${page}) t`
    } else if (state.op === 'insert') {
      const rows = Array.isArray(state.payload) ? state.payload : [state.payload]
      const cols = Object.keys(rows[0]).map(ident)
      const values = rows.map((r) => `(${cols.map((c) => `$${params.push(toParam(r[c] ?? null))}`).join(', ')})`).join(', ')
      const insert = `insert into public.${state.table} (${cols.join(', ')}) values ${values}`
      sql = state.returning ? `with r as (${insert} returning ${returning}) select to_jsonb(r) as j from r` : insert
    } else if (state.op === 'update') {
      const sets = Object.entries(state.payload).map(([c, v]) => `${ident(c)} = $${params.push(toParam(v ?? null))}`).join(', ')
      const where = buildWhere(state.filters, params)
      const update = `update public.${state.table} set ${sets} ${where}`
      sql = state.returning ? `with r as (${update} returning ${returning}) select to_jsonb(r) as j from r` : update
    } else if (state.op === 'delete') {
      const del = `delete from public.${state.table} ${buildWhere(state.filters, params)}`
      sql = state.returning ? `with r as (${del} returning ${returning}) select to_jsonb(r) as j from r` : del
    }
    const result = await asUser(db, getUserId(), (d) => d.query(sql, params))
    return result.rows.map((r) => r.j)
  }

  async function execute(state) {
    log.push(state)
    if (hooks.before) await hooks.before(state)
    try {
      return shapeResult(await run(state), state)
    } catch (e) {
      if (!e.code && !e.message) throw e
      return { data: null, error: { code: e.code, message: e.message, details: e.detail ?? null, hint: e.hint ?? null } }
    }
  }

  return {
    log,
    auth: {
      getSession: async () => {
        const id = getUserId()
        return { data: { session: id ? { user: { id } } : null }, error: null }
      },
    },
    from: (table) => createQueryBuilder(table, execute),
  }
}
