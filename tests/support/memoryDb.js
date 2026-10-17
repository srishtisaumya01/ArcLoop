// A tiny in-memory MOCK of the three planner tables for unit tests: it filters, inserts, updates and
// deletes rows so service flows can run end to end. It enforces NO constraints, triggers or RLS
// (so it proves nothing about security or the schema). `overrides['table:op']` can replace any
// answer, for example to inject an error.

let seq = 0
export const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
const clone = (v) => JSON.parse(JSON.stringify(v))

export const occRow = (o = {}) => ({
  id: uuid(), template_id: null, plan_date: '2026-03-10', title: 'Task', description: null, category: null, is_priority: false,
  planned_start: null, planned_end: null, estimated_minutes: null, completion: 0, completed_at: null, plan_state: 'active',
  excluded_reason: null, excluded_at: null, rescheduled_from_id: null, in_original_plan: true, is_customized: false,
  created_at: '2026-03-10T08:00:00+00:00', ...o,
})
export const dayRow = (o = {}) => ({ plan_date: '2026-03-10', day_mode: 'normal', baseline_at: null, suppressed_template_ids: [], ...o })
export const tplRow = (o = {}) => ({
  id: uuid(), title: 'Walk', description: null, category: null, is_priority: false, planned_start: null, planned_end: null,
  estimated_minutes: null, recurrence: 'daily', weekdays: null, starts_on: '2026-01-01', ends_on: null, archived_at: null,
  created_at: '2026-01-01T00:00:00+00:00', ...o,
})

const compare = {
  eq: (a, b) => a === b,
  neq: (a, b) => a !== b,
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
  is: (a, b) => (b === null ? a === null || a === undefined : a === b),
  in: (a, b) => b.includes(a),
}
const matches = (row, filters) => filters.every((f) => compare[f.op](row[f.column], f.value))
const project = (row, columns) => (columns === '*' ? row : Object.fromEntries(columns.split(',').map((c) => c.trim()).map((c) => [c, row[c]])))

export function createMemoryDb({ templates = [], days = [], occurrences = [], overrides = {} } = {}) {
  const tables = { task_templates: templates.map(clone), day_plans: days.map(clone), task_occurrences: occurrences.map(clone) }
  const ops = []

  function handler(state) {
    ops.push(state)
    const custom = overrides[`${state.table}:${state.op}`]
    if (custom) {
      const answer = custom(state, tables)
      if (answer !== undefined) return answer
    }
    const rows = tables[state.table]
    if (!rows) return { rows: [] }
    if (state.op === 'select') {
      let found = rows.filter((r) => matches(r, state.filters)).map(clone)
      for (const { column, ascending } of [...state.order].reverse()) found.sort((a, b) => (a[column] < b[column] ? -1 : a[column] > b[column] ? 1 : 0) * (ascending ? 1 : -1))
      if (state.range) found = found.slice(state.range[0], state.range[1] + 1)
      return { rows: found.map((r) => project(r, state.columns)) }
    }
    if (state.op === 'insert') {
      const created = (Array.isArray(state.payload) ? state.payload : [state.payload]).map((p) => {
        const base = state.table === 'task_occurrences' ? occRow() : state.table === 'day_plans' ? dayRow() : tplRow()
        return { ...base, ...p }
      })
      rows.push(...created)
      return { rows: created.map((r) => project(clone(r), state.columns)) }
    }
    if (state.op === 'update') {
      const hit = rows.filter((r) => matches(r, state.filters))
      for (const r of hit) Object.assign(r, state.payload)
      return { rows: hit.map((r) => project(clone(r), state.columns)) }
    }
    const removed = rows.filter((r) => matches(r, state.filters))
    tables[state.table] = rows.filter((r) => !removed.includes(r))
    return { rows: removed.map((r) => project(clone(r), state.columns)) }
  }

  return { handler, tables, ops, writes: () => ops.filter((o) => o.op !== 'select') }
}
