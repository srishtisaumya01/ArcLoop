// In-memory stand-in for the Arcloop (Django) API, used by the browser tests that run without a server.
// It understands the collection URLs the app sends (`/api/v1/<name>/` with `col`, `col__op`, order, limit and offset),
// stores creates, updates and deletes per test, enforces the two unique rules the models have, and imitates the
// server-set values the app reads back (completed_at, excluded_at, baseline_at, in_original_plan).
// It also imitates the session rules the app depends on: nothing but sign-in and a few public calls works unless someone
// is signed in, and every request that changes data must carry the CSRF header the real server demands, so a screen that
// forgot it fails here instead of only in production.
// It is NOT the real API: the real one is exercised by the e2e-django suite (npm run test:e2e:django).
export const API_GLOB = '**/api/v1/**' // the API is same-origin: Playwright intercepts these on the app's own origin
export const CSRF_COOKIE = 'arcloop_csrf' // the real names, kept in step by tests/integration/authContract.integration.test.js
export const CSRF_HEADER = 'x-csrftoken'
export const CSRF_VALUE = 'stub-csrf-secret'
export const USER_ID = 1
export const EMAIL = 'asha@example.com'
export const TODAY = '2026-03-10' // a Tuesday; the browser clock is pinned to 11:00 New York
export const NOW_ISO = '2026-03-10T15:00:00.000Z'

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const clone = (value) => JSON.parse(JSON.stringify(value))

export function seedData() {
  let n = 100
  const tpl = (id, o) => ({ id: uid(id), user_id: USER_ID, description: null, category: null, is_priority: false, priority_level: 'medium', planned_start: null, planned_end: null, estimated_minutes: null, weekdays: null, ends_on: null, archived_at: null, created_at: '2026-03-01T00:00:00Z', starts_on: '2026-03-01', recurrence: 'daily', ...o })
  const occ = (templateId, date, title, completion = 0, o = {}) => ({
    id: uid((n += 1)), user_id: USER_ID, template_id: templateId ? uid(templateId) : null, plan_date: date, title, description: null, category: null,
    is_priority: false, priority_level: 'medium', planned_start: null, planned_end: null, estimated_minutes: null, completion, completed_at: completion > 0 ? `${date}T20:00:00Z` : null,
    plan_state: 'active', excluded_reason: null, excluded_at: null, rescheduled_from_id: null, in_original_plan: true, is_customized: false, is_minimum: false,
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
      occ(null, TODAY, 'Call the dentist', 0, { is_priority: true, priority_level: 'high', planned_start: '09:00:00', estimated_minutes: 15 }),
    ],
    reminder_preferences: [],
    task_reminders: [],
  }
}

const RESOURCES = {
  'task-templates': 'task_templates',
  'day-plans': 'day_plans',
  'task-occurrences': 'task_occurrences',
  'reminder-preferences': 'reminder_preferences',
  'task-reminders': 'task_reminders',
}

const DEFAULTS = {
  task_templates: () => ({ id: null, description: null, category: null, is_priority: false, priority_level: 'medium', planned_start: null, planned_end: null, estimated_minutes: null, weekdays: null, ends_on: null, archived_at: null, created_at: NOW_ISO }),
  day_plans: () => ({ day_mode: 'normal', baseline_at: null, suppressed_template_ids: [] }),
  task_occurrences: () => ({ id: null, template_id: null, description: null, category: null, is_priority: false, priority_level: 'medium', planned_start: null, planned_end: null, estimated_minutes: null, completion: 0, completed_at: null, plan_state: 'active', excluded_reason: null, excluded_at: null, rescheduled_from_id: null, in_original_plan: true, is_customized: false, is_minimum: false, created_at: NOW_ISO }),
  reminder_preferences: () => ({ enabled: false, remind_time: '09:00:00', weekdays: [1, 2, 3, 4, 5, 6, 7], last_notified_on: '1970-01-01' }),
  task_reminders: () => ({ id: null, plan_date: null, notified_at: null, created_at: NOW_ISO }),
}

function matchesFilter(row, column, op, value) {
  const actual = row[column]
  if (op === '') return String(actual) === value
  if (op === 'neq') return String(actual) !== value
  if (op === 'gte') return String(actual) >= value
  if (op === 'lte') return String(actual) <= value
  if (op === 'gt') return String(actual) > value
  if (op === 'lt') return String(actual) < value
  if (op === 'isnull') return (actual == null) === (value === 'true')
  if (op === 'in') return value.split(',').includes(String(actual))
  return true
}

// `mode`: 'normal' | 'empty' (no plans or templates) | 'error' (a screen's first reads fail) | 'slow' (they take 2 s)
export function createStubApi({ seed = seedData(), mode = 'normal', signedIn = true } = {}) {
  const tables = clone(seed)
  const state = { mode, signedIn, csrfRefused: 0, log: [] }
  let counter = 5000

  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' }
  const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) })
  const error = (route, status, code, message) => json(route, status, { error: { code, message } })

  const EXPIRES = '2999-01-01T00:00:00Z'
  const unauthenticated = (route) => error(route, 401, 'unauthenticated', 'Please log in again to continue.')
  // A cookie sign-in answers with the user and the expiry only: the credential is an HttpOnly cookie, never in the body.
  const session = { expires_at: EXPIRES, user: { id: USER_ID, email: EMAIL } }

  function auth(route, req, url) {
    const path = url.pathname.replace('/api/v1/auth', '')
    const body = JSON.parse(req.postData() || '{}')
    if (path === '/login/') {
      if (body.transport !== 'cookie') return error(route, 400, 'validation_error', 'The browser must ask for the cookie transport.')
      if (body.email !== EMAIL || body.password !== 'correct-horse-battery') return error(route, 401, 'invalid_credentials', 'Email or password is incorrect.')
      state.signedIn = true
      return json(route, 200, session)
    }
    if (path === '/register/') {
      state.signedIn = true
      return json(route, 201, session)
    }
    if (path === '/me/') return state.signedIn ? json(route, 200, { ...session.user, expires_at: EXPIRES }) : unauthenticated(route)
    if (path === '/password/reset/' || path === '/password/reset/confirm/') return route.fulfill({ status: 204, headers })
    if (path === '/logout/' || path === '/account/delete/') state.signedIn = false
    return route.fulfill({ status: 204, headers })
  }

  function profile(route, req) {
    const row = tables.profiles[0]
    state.log.push({ method: req.method(), table: 'profiles', search: '', body: req.method() === 'GET' ? null : JSON.parse(req.postData() || 'null') })
    if (req.method() === 'PATCH') Object.assign(row, JSON.parse(req.postData() || '{}'))
    return json(route, 200, row)
  }

  function collection(route, req, url, table) {
    const rows = tables[table]
    const method = req.method()
    const filters = [...url.searchParams]
      .filter(([k]) => !['order', 'limit', 'offset'].includes(k))
      .map(([k, value]) => {
        const [column, op = ''] = k.split('__')
        return { column, op, value }
      })
    const matching = () => rows.filter((row) => filters.every((f) => matchesFilter(row, f.column, f.op, f.value)))
    const respond = (status, list) => json(route, status, { results: list })
    const conflict = () => error(route, 409, 'conflict', 'That already exists.')
    state.log.push({ method, table, search: url.search, body: method === 'GET' ? null : JSON.parse(req.postData() || 'null') })

    if (method === 'GET') {
      if (state.mode === 'empty' && ['day_plans', 'task_occurrences', 'task_templates', 'task_reminders'].includes(table)) return respond(200, [])
      let list = matching()
      const order = url.searchParams.get('order')
      if (order) {
        const keys = order.split(',').map((part) => (part.startsWith('-') ? [part.slice(1), 'desc'] : [part, 'asc']))
        list = [...list].sort((a, b) => {
          for (const [col, dir] of keys) {
            const x = String(a[col] ?? '')
            const y = String(b[col] ?? '')
            if (x !== y) return (x < y ? -1 : 1) * (dir === 'desc' ? -1 : 1)
          }
          return 0
        })
      }
      const offset = Number(url.searchParams.get('offset') ?? 0)
      const limit = Number(url.searchParams.get('limit') ?? 1000)
      return respond(200, list.slice(offset, offset + limit))
    }
    if (method === 'POST') {
      const body = JSON.parse(req.postData() || '[]')
      const incoming = (Array.isArray(body) ? body : [body]).map((r) => ({ ...DEFAULTS[table](), ...r }))
      for (const row of incoming) {
        if ('id' in row && !row.id) row.id = uid((counter += 1))
        if (table === 'day_plans' && rows.some((e) => e.plan_date === row.plan_date)) return conflict()
        if (table === 'task_occurrences') {
          if (row.template_id && rows.some((e) => e.template_id === row.template_id && e.plan_date === row.plan_date)) return conflict()
          const day = tables.day_plans.find((d) => d.plan_date === row.plan_date)
          row.in_original_plan = !day || day.baseline_at === null // what the server does
        }
        if (table === 'task_reminders') row.plan_date = tables.task_occurrences.find((o) => o.id === row.occurrence_id)?.plan_date ?? null
        rows.push(row)
      }
      return respond(201, incoming)
    }
    if (method === 'PATCH') {
      const patch = JSON.parse(req.postData() || '{}')
      const targets = matching()
      if (table === 'task_occurrences' && patch.is_minimum === true) {
        // Mirrors the server: only a planned task, and at most three per day.
        for (const row of targets) {
          const others = tables.task_occurrences.filter((o) => o.plan_date === row.plan_date && o.is_minimum && o.id !== row.id).length
          if (row.plan_state !== 'active') return error(route, 400, 'constraint_violation', 'Only a task that is still planned can be part of your minimum.')
          if (others >= 3) return error(route, 400, 'limit_reached', 'Choose up to 3 tasks for your minimum.')
        }
      }
      for (const row of targets) {
        Object.assign(row, patch)
        if (table === 'task_occurrences') {
          // The server-set timestamps and the baseline rule.
          if ('completion' in patch) row.completed_at = Number(patch.completion) > 0 ? NOW_ISO : null
          if (patch.plan_state === 'excluded') {
            row.excluded_at = NOW_ISO
            row.is_minimum = false // setting a task aside takes it out of the minimum, as the server does
          }
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
    return error(route, 405, 'method_not_allowed', 'That is not supported.')
  }

  async function handle(route) {
    const req = route.request()
    const url = new URL(req.url())
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (!url.pathname.startsWith('/api/v1/')) return json(route, 404, {})
    const isPublic = /\/auth\/(login|register|password\/reset(\/confirm)?|me)\/$/.test(url.pathname)
    if (!isPublic && !state.signedIn) return unauthenticated(route)
    // Anything that changes data must prove it came from the app, exactly as the real server insists (config/auth_cookies.py).
    if (!isPublic && !['GET', 'HEAD'].includes(req.method()) && req.headers()[CSRF_HEADER] !== CSRF_VALUE) {
      state.csrfRefused += 1
      return error(route, 403, 'csrf_failed', 'Your session could not be verified. Reload the page and try again.')
    }
    if (url.pathname.startsWith('/api/v1/auth/')) return auth(route, req, url)
    const slug = url.pathname.replace('/api/v1/', '').replace(/\/$/, '')
    const isProfile = slug === 'profile'
    const table = RESOURCES[slug]
    if (!isProfile && !table) return error(route, 404, 'not_found', 'That could not be found.')
    // Error and slow modes affect the reads each screen loads first: planner days and tasks, reminder settings, and the
    // profile that Settings reads (every other page's profile read, for the timezone, is left alone).
    const onSettings = (req.frame()?.url() ?? '').includes('/app/settings')
    const screenRead = req.method() === 'GET' && (['day_plans', 'task_occurrences', 'reminder_preferences', 'task_reminders'].includes(table) || (isProfile && onSettings))
    if (state.mode === 'error' && screenRead) return error(route, 500, 'server_error', 'stubbed failure')
    // Slow mode delays only day reads, so the loading state is visible without every one of a page's reads being slow.
    if (state.mode === 'slow' && screenRead && table !== 'task_occurrences') await new Promise((r) => setTimeout(r, 2000))
    return isProfile ? profile(route, req) : collection(route, req, url, table)
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
