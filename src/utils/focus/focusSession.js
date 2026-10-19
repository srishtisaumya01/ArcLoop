// The focus timer's rules, as plain functions of a saved session and a clock reading (milliseconds since 1970). Nothing here
// counts ticks: the time focused is always worked out from timestamps, so a refresh, a closed tab or a throttled background
// tab cannot make it drift. A session is one saved object, so the page, a reload and a second tab all read the same facts.
//
//   session = { v, id, taskId, planDate, title, plannedMs, status: 'running' | 'paused', startedAt,
//               segmentStartedAt (when the current running stretch began, null while paused), accumulatedMs (focused before it), pausedAt }
//   record  = { id, taskId, planDate, title, plannedMs, focusedMs, outcome: 'completed' | 'ended_early', startedAt, endedAt }

export const PRESET_MINUTES = [15, 25, 45, 60]
export const STALE_PAUSE_MS = 24 * 60 * 60 * 1000 // a session left paused for a day is closed as ended early, with what it had
const VERSION = 1
const MINUTE = 60 * 1000

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)
const isText = (value) => typeof value === 'string' && value.length > 0

export function startSession({ id, taskId, planDate, title, minutes, now }) {
  if (!PRESET_MINUTES.includes(minutes)) throw new Error(`A focus session lasts ${PRESET_MINUTES.join(', ')} minutes.`)
  return { v: VERSION, id, taskId, planDate, title, plannedMs: minutes * MINUTE, status: 'running', startedAt: now, segmentStartedAt: now, accumulatedMs: 0, pausedAt: null }
}

// Time focused so far, uncapped: what was banked before this stretch plus this stretch up to `now`. A clock that went backwards adds nothing.
const rawElapsedMs = (session, now) => session.accumulatedMs + (session.status === 'running' ? Math.max(0, now - session.segmentStartedAt) : 0)

export const elapsedMs = (session, now) => Math.min(session.plannedMs, rawElapsedMs(session, now))
export const remainingMs = (session, now) => session.plannedMs - elapsedMs(session, now)
export const progressFraction = (session, now) => elapsedMs(session, now) / session.plannedMs
export const isFinished = (session, now) => rawElapsedMs(session, now) >= session.plannedMs

export function pauseSession(session, now) {
  if (session.status !== 'running') return session
  return { ...session, status: 'paused', accumulatedMs: rawElapsedMs(session, now), segmentStartedAt: null, pausedAt: now }
}

export function resumeSession(session, now) {
  if (session.status !== 'paused') return session
  return { ...session, status: 'running', segmentStartedAt: now, pausedAt: null }
}

const recordOf = (session, focusedMs, outcome, endedAt) => ({
  id: session.id, taskId: session.taskId, planDate: session.planDate, title: session.title,
  plannedMs: session.plannedMs, focusedMs: Math.round(focusedMs), outcome, startedAt: session.startedAt, endedAt,
})

// The record of a session that ran its whole length. It ended when the time was used up, not when somebody noticed (a tab that
// was closed for an hour does not add that hour).
export function completedRecord(session, now) {
  const endedAt = session.status === 'running' ? session.segmentStartedAt + (session.plannedMs - session.accumulatedMs) : session.pausedAt ?? now
  return recordOf(session, session.plannedMs, 'completed', Math.min(endedAt, now))
}

// The record of a session someone ended before its time. Paused time was never counted, so it is not in the figure.
export function endedEarlyRecord(session, now) {
  if (isFinished(session, now)) return completedRecord(session, now)
  return recordOf(session, elapsedMs(session, now), 'ended_early', now)
}

// What saved text says now. Returns { session, record }: a session still going, a record when it turned out to be over
// (finished while nobody was looking, or left paused far too long), or both null when the text is not a usable session.
export function restoreSession(raw, now) {
  let value
  try {
    value = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    return { session: null, record: null }
  }
  if (!value || typeof value !== 'object' || value.v !== VERSION) return { session: null, record: null }
  const { id, taskId, planDate, title, plannedMs, status, startedAt, segmentStartedAt, accumulatedMs, pausedAt } = value
  const shape =
    isText(id) && isText(taskId) && /^\d{4}-\d{2}-\d{2}$/.test(planDate ?? '') && isText(title) &&
    isNumber(plannedMs) && PRESET_MINUTES.some((m) => m * MINUTE === plannedMs) &&
    isNumber(startedAt) && isNumber(accumulatedMs) && accumulatedMs >= 0 && accumulatedMs <= plannedMs &&
    ((status === 'running' && isNumber(segmentStartedAt)) || (status === 'paused' && isNumber(pausedAt)))
  if (!shape) return { session: null, record: null }
  const session = { v: VERSION, id, taskId, planDate, title, plannedMs, status, startedAt, segmentStartedAt: status === 'running' ? segmentStartedAt : null, accumulatedMs, pausedAt: status === 'paused' ? pausedAt : null }
  if (isFinished(session, now)) return { session: null, record: completedRecord(session, now) }
  if (session.status === 'paused' && now - session.pausedAt > STALE_PAUSE_MS) return { session: null, record: recordOf(session, session.accumulatedMs, 'ended_early', session.pausedAt) }
  return { session, record: null }
}

// 25:00 style, rounded up so the last second shows 00:01 rather than 00:00 while time is left.
export function formatClock(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export const wholeMinutes = (ms) => Math.round(ms / MINUTE)
