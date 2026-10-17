// In-memory stand-in for the Supabase REST (PostgREST) and auth endpoints, used by the browser tests.
// It understands the query shapes supabase-js sends (filters, order, object/array accept headers),
// stores inserts, updates and deletes per test, enforces the two unique rules the migrations have,
// and imitates the two server-set timestamps the app reads back (completed_at, baseline_at).
// It is NOT Supabase: nothing here proves hosted RLS, PostgREST or the auth service.
export const API = 'http://127.0.0.1:54321'
export const USER_ID = '11111111-1111-4111-8111-000000000001'
export const EMAIL = 'asha@example.com'
export const TODAY = '2026-03-10' // a Tuesday; the browser clock is pinned to 11:00 New York
export const NOW_ISO = '2026-03-10T15:00:00.000Z'

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const clone = (value) => JSON.parse(JSON.stringify(value))

export function seedData() {
  let n = 100
  const tpl = (id, o) => ({ id: uid(id), user_id: USER_ID, description: null, category: null, is_priority: false, planned_start: null, planned_end: null, estimated_minutes: null, weekdays: null, ends_on: null, archived_at: null, created_at: '2026-03-01T00:00:00Z', starts_on: '2026-03-01', recurrence: 'daily', ...o })
  const occ = (templateId, date, title, completion = 0, o = {}) => ({
    id: uid((n += 1)), user_id: USER_ID, template_id: templateId ? uid(templateId) : null, plan_date: date, title, description: null, category: null,
    is_priority: false, planned_start: null, planned_end: null, estimated_minutes: null, completion, completed_at: completion > 0 ? `${date}T20:00:00Z` : null,
    plan_state: 'active', excluded_reason: null, excluded_at: null, rescheduled_from_id: null, in_original_plan: true, is_customized: false,
    created_at: `${date}T08:00:00Z`, ...o,
  })
  const day = (date, mode = 'normal', baseline = null) => ({ user_id: USER_ID, plan_date: date, day_mode: mode, baseline_at: baseline, suppressed_template_ids: [] })
  const read = (date, completion) => occ(2, date, 'Read for twenty minutes', completion, { planned_start: '07:30:00', estimated_minutes: 20 })
  return {
    profiles: [{ id: USER_ID, display_name: 'Asha', timezone: 'America/New_York', interests: [], profile_visibility: 'private', progress_visibility: 'private', created_at: '2026-01-01T00:00:00Z' }],
    task_templates: [
      tpl(1, { title: 'Morning walk' }),
      tpl(2, { title: 'Read for twenty minutes', planned_start: '07:30:00', estimated_minutes: 20 }),
      tpl(3, { title: 'Gym session', recurrence: 'weekly', weekdays: [2, 4], planned_start: '18:00:00', estimated_minutes: 60 }),
    ],
    // Last week: progress on 4 to 7 March, a rest day on the 8th. 9 March was planned and never touched.
    day_plans: [day('2026-03-04', 'normal', '2026-03-04T12:00:00Z'), day('2026-03-05', 'normal', '2026-03-05T12:00:00Z'), day('2026-03-06', 'normal', '2026-03-06T12:00:00Z'), day('2026-03-07', 'normal', '2026-03-07T12:00:00Z'), day('2026-03-08', 'rest'), day('2026-03-09'), day(TODAY)],
    task_occurrences: [
      occ(1, '2026-03-04', 'Morning walk', 1), read('2026-03-04', 1),
      occ(1, '2026-03-05', 'Morning walk', 1), read('2026-03-05', 1), occ(3, '2026-03-05', 'Gym session', 1, { planned_start: '18:00:00', estimated_minutes: 60 }),
      occ(1, '2026-03-06', 'Morning walk', 0.5), read('2026-03-06', 1),
      occ(1, '2026-03-07', 'Morning walk', 0), read('2026-03-07', 1),
      occ(1, '2026-03-08', 'Morning walk', 0), read('2026-03-08', 0),
      occ(1, '2026-03-09', 'Morning walk', 0), read('2026-03-09', 0),
      occ(1, TODAY, 'Morning walk', 0), read(TODAY, 0),
      occ(3, TODAY, 'Gym session', 0, { planned_start: '18:00:00', estimated_minutes: 60 }),
      occ(null, TODAY, 'Call the dentist', 0, { is_priority: true, planned_start: '09:00:00', estimated_minutes: 15 }),
    ],
    reminder_preferences: [],
    task_reminders: [],
  }
}

export function sessionFor(userId = USER_ID, email = EMAIL) {
  const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const accessToken = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: userId, role: 'authenticated', exp: 4102444800 })}.e2e-signature`
  const user = { id: userId, email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
  return { access_token: accessToken, refresh_token: 'e2e-refresh', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
}
export const STORAGE_KEY = 'sb-127-auth-token' // supabase-js derives it from the API host

const DEFAULTS = {
  task_templates: () => ({ id: null, description: null, category: null, is_priority: false, planned_start: null, planned_end: null, estimated_minutes: null, weekdays: null, ends_on: null, archived_at: null, created_at: NOW_ISO }),
  day_plans: () => ({ day_mode: 'normal', baseline_at: null, suppressed_template_ids: [] }),
  task_occurrences: () => ({ id: null, template_id: null, description: null, category: null, is_priority: false, planned_start: null, planned_end: null, estimated_minutes: null, completion: 0, completed_at: null, plan_state: 'active', excluded_reason: null, excluded_at: null, rescheduled_from_id: null, in_original_plan: true, is_customized: false, created_at: NOW_ISO }),
  reminder_preferences: () => ({ enabled: false, remind_time: '09:00:00', weekdays: [1, 2, 3, 4, 5, 6, 7], last_notified_on: '1970-01-01' }),
  task_reminders: () => ({ id: null, plan_date: null, notified_at: null, created_at: NOW_ISO }),
}

function parseIn(value) {
  return value.replace(/^\(|\)$/g, '').split(',').map((v) => v.trim().replace(/^"|"$/g, ''))
}
function matches(row, key, spec) {
  const dot = spec.indexOf('.')
  const op = spec.slice(0, dot)
  const value = spec.slice(dot + 1)
  const actual = row[key]
  if (op === 'eq') return String(actual) === value
  if (op === 'neq') return String(actual) !== value
  if (op === 'gte') return String(actual) >= value
  if (op === 'lte') return String(actual) <= value
  if (op === 'gt') return String(actual) > value
  if (op === 'lt') return String(actual) < value
  if (op === 'is') return value === 'null' ? actual == null : String(actual) === value
  if (op === 'in') return parseIn(value).includes(String(actual))
  return true
}

// `mode`: 'normal' | 'empty' (no plans or templates) | 'error' (a screen's first reads fail) | 'slow' (they take 2 s)
export function createStubApi({ seed = seedData(), mode = 'normal' } = {}) {
  const tables = clone(seed)
  const state = { mode, log: [] }
  let counter = 5000

  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' }
  const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) })

  function auth(route, req, url) {
    const path = url.pathname.replace('/auth/v1', '')
    if (path === '/token') {
      const body = JSON.parse(req.postData() || '{}')
      const grant = url.searchParams.get('grant_type')
      if (grant === 'password' && body.email === EMAIL && body.password === 'correct-horse-battery') return json(route, 200, sessionFor())
      // The shape the hosted auth service returns, which supabase-js turns into an error with code 'invalid_credentials'.
      if (grant === 'password') return json(route, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
      if (grant === 'refresh_token') return json(route, 200, sessionFor())
    }
    if (path === '/logout') return route.fulfill({ status: 204, headers })
    if (path === '/user') return json(route, 200, sessionFor().user)
    return json(route, 200, {})
  }

  function rest(route, req, url) {
    const table = url.pathname.split('/').pop()
    const rows = tables[table]
    if (!rows) return json(route, 404, { code: '42P01', message: `relation "public.${table}" does not exist` })
    const method = req.method()
    const filters = [...url.searchParams].filter(([k]) => !['select', 'order', 'limit', 'offset'].includes(k))
    const matching = () => rows.filter((row) => filters.every(([k, spec]) => matches(row, k, spec)))
    const wantsObject = (req.headers().accept ?? '').includes('vnd.pgrst.object+json')
    const respond = (status, list) => {
      if (!wantsObject) return json(route, status, list)
      if (list.length === 1) return json(route, status, list[0])
      return json(route, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${list.length} rows`, hint: null })
    }
    state.log.push({ method, table, search: url.search, body: method === 'GET' ? null : JSON.parse(req.postData() || 'null') })

    if (method === 'GET') {
      if (state.mode === 'empty' && ['day_plans', 'task_occurrences', 'task_templates', 'task_reminders'].includes(table)) return respond(200, [])
      let list = matching()
      const order = url.searchParams.get('order')
      if (order) {
        const keys = order.split(',').map((part) => part.split('.'))
        list = [...list].sort((a, b) => {
          for (const [col, dir] of keys) {
            const x = String(a[col] ?? '')
            const y = String(b[col] ?? '')
            if (x !== y) return (x < y ? -1 : 1) * (dir === 'desc' ? -1 : 1)
          }
          return 0
        })
      }
      return respond(200, list)
    }
    if (method === 'POST') {
      const body = JSON.parse(req.postData() || '[]')
      const incoming = (Array.isArray(body) ? body : [body]).map((r) => ({ ...DEFAULTS[table](), ...r }))
      for (const row of incoming) {
        if ('id' in row && !row.id) row.id = uid((counter += 1))
        if (table === 'day_plans' && rows.some((e) => e.plan_date === row.plan_date)) return json(route, 409, { code: '23505', message: 'duplicate key value violates unique constraint "day_plans_pkey"', details: null, hint: null })
        if (table === 'task_occurrences') {
          if (row.template_id && rows.some((e) => e.template_id === row.template_id && e.plan_date === row.plan_date)) return json(route, 409, { code: '23505', message: 'duplicate key value violates unique constraint "task_occurrences_template_date_key"', details: null, hint: null })
          const day = tables.day_plans.find((d) => d.plan_date === row.plan_date)
          row.in_original_plan = !day || day.baseline_at === null // what the trigger does
        }
        if (table === 'task_reminders') row.plan_date = tables.task_occurrences.find((o) => o.id === row.occurrence_id)?.plan_date ?? null
        rows.push(row)
      }
      return respond(201, incoming)
    }
    if (method === 'PATCH') {
      const patch = JSON.parse(req.postData() || '{}')
      const targets = matching()
      for (const row of targets) {
        Object.assign(row, patch)
        if (table === 'task_occurrences') {
          // The two server-set timestamps and the baseline rule, as the migration's triggers set them.
          if ('completion' in patch) row.completed_at = Number(patch.completion) > 0 ? NOW_ISO : null
          if (patch.plan_state === 'excluded') row.excluded_at = NOW_ISO
          if (patch.plan_state === 'active') row.excluded_at = null
          const day = tables.day_plans.find((d) => d.plan_date === row.plan_date)
          if (day && day.baseline_at === null && (Number(row.completion) > 0 || row.plan_state === 'excluded')) day.baseline_at = NOW_ISO
        }
        if (table === 'task_reminders' && 'remind_time' in patch) row.notified_at = null
      }
      return respond(200, targets)
    }
    if (method === 'DELETE') {
      const targets = matching()
      tables[table] = rows.filter((row) => !targets.includes(row))
      if (table === 'task_templates') for (const o of tables.task_occurrences) if (targets.some((t) => t.id === o.template_id)) o.template_id = null
      if (table === 'task_occurrences') tables.task_reminders = tables.task_reminders.filter((r) => !targets.some((t) => t.id === r.occurrence_id))
      return respond(200, targets)
    }
    return json(route, 405, { message: 'method not allowed' })
  }

  async function handle(route) {
    const req = route.request()
    const url = new URL(req.url())
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (url.pathname.startsWith('/auth/v1/')) return auth(route, req, url)
    if (!url.pathname.startsWith('/rest/v1/')) return json(route, 404, {})
    // Error and slow modes affect the reads each screen loads first: planner days and tasks, reminder settings, and the
    // full profile that Settings reads (the timezone-only profile read every service makes is left alone).
    const table = url.pathname.split('/').pop()
    const screenRead = req.method() === 'GET' && (['day_plans', 'task_occurrences', 'reminder_preferences', 'task_reminders'].includes(table) || (table === 'profiles' && (url.searchParams.get('select') ?? '').includes('display_name')))
    if (state.mode === 'error' && screenRead) return json(route, 500, { message: 'stubbed failure' })
    // Slow mode delays only day reads, so the loading state is visible without every one of a page's reads being slow.
    if (state.mode === 'slow' && screenRead && table !== 'task_occurrences') await new Promise((r) => setTimeout(r, 2000))
    return rest(route, req, url)
  }

  return {
    handle,
    state,
    tables,
    rows: (table) => tables[table],
    find: (table, predicate) => tables[table].find(predicate),
    writes: (table) => state.log.filter((entry) => entry.method !== 'GET' && (!table || entry.table === table)),
    setMode: (next) => {
      state.mode = next
    },
  }
}
