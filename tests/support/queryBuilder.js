// A minimal stand-in for the supabase-js / PostgREST query builder, covering exactly the calls
// the planner services use. It only collects the query; an `execute(state)` function supplied by
// the caller decides what happens (a scripted answer in unit tests, real SQL in the PGlite adapter).

export function createQueryBuilder(table, execute) {
  const state = { table, op: 'select', columns: '*', filters: [], order: [], limit: null, range: null, payload: null, returning: false, single: null }
  const filter = (op) => (column, value) => {
    state.filters.push({ column, op, value })
    return builder
  }
  const builder = {
    select(columns = '*') {
      state.columns = columns
      if (state.op !== 'select') state.returning = true
      return builder
    },
    insert(payload) {
      state.op = 'insert'
      state.payload = payload
      return builder
    },
    update(payload) {
      state.op = 'update'
      state.payload = payload
      return builder
    },
    delete() {
      state.op = 'delete'
      return builder
    },
    eq: filter('eq'),
    neq: filter('neq'),
    gt: filter('gt'),
    gte: filter('gte'),
    lt: filter('lt'),
    lte: filter('lte'),
    is: filter('is'),
    in: filter('in'),
    order(column, { ascending = true } = {}) {
      state.order.push({ column, ascending })
      return builder
    },
    limit(n) {
      state.limit = n
      return builder
    },
    range(from, to) {
      state.range = [from, to]
      return builder
    },
    maybeSingle() {
      state.single = 'maybe'
      return builder
    },
    single() {
      state.single = 'one'
      return builder
    },
    then(resolve, reject) {
      return Promise.resolve(execute(JSON.parse(JSON.stringify(state)))).then(resolve, reject)
    },
  }
  return builder
}

// Applies .single()/.maybeSingle() the way PostgREST does, and the "no select => no data" rule for writes.
export function shapeResult(rows, state) {
  if (state.single) {
    if (rows.length === 1) return { data: rows[0], error: null }
    if (rows.length === 0 && state.single === 'maybe') return { data: null, error: null }
    return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: null, hint: null } }
  }
  if (state.op !== 'select' && !state.returning) return { data: null, error: null }
  return { data: rows, error: null }
}
