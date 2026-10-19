// Where focus sessions are kept: this browser's localStorage, one active session and a short log per person. It is a convenience
// store like the dismissed notes (nothing here is sent to the server): if storage is unavailable the timer still works for the
// visit and simply is not remembered. `storage` is a parameter so tests can use a stand-in.
import { restoreSession } from './focusSession.js'

const activeKey = (userId) => `arcloop.focus.active.${userId}`
const logKey = (userId) => `arcloop.focus.log.${userId}`
const seenKey = (userId) => `arcloop.focus.seen.${userId}`
const MAX_RECORDS = 200

const defaultStorage = () => {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export const focusStorageKeys = { active: activeKey, log: logKey }

export function readActiveRaw(userId, storage = defaultStorage()) {
  try {
    return storage?.getItem(activeKey(userId)) ?? null
  } catch {
    return null
  }
}

export function writeActive(userId, session, storage = defaultStorage()) {
  try {
    storage?.setItem(activeKey(userId), JSON.stringify(session))
    return true
  } catch {
    return false
  }
}

export function clearActive(userId, storage = defaultStorage()) {
  try {
    storage?.removeItem(activeKey(userId))
    storage?.removeItem(seenKey(userId))
  } catch {
    // Not remembered.
  }
}

// When the running timer was last looked at in ANY tab of this person (the tab that is showing it writes this every few seconds). A tab
// that was frozen for a while uses it to tell "the timer was not running" from "another tab kept it running".
export function readSeen(userId, storage = defaultStorage()) {
  try {
    const value = Number(storage?.getItem(seenKey(userId)))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

export function writeSeen(userId, now, storage = defaultStorage()) {
  try {
    storage?.setItem(seenKey(userId), String(now))
  } catch {
    // Not remembered: a second tab may then ask about a gap that was not one.
  }
}

// Saved records that are still well formed, oldest first. Anything else in the log is ignored, not repaired.
export function readLog(userId, storage = defaultStorage()) {
  try {
    const list = JSON.parse(storage?.getItem(logKey(userId)) ?? '[]')
    return Array.isArray(list)
      ? list.filter((r) => r && typeof r.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.planDate ?? '') && Number.isFinite(r.focusedMs) && (r.outcome === 'completed' || r.outcome === 'ended_early'))
      : []
  } catch {
    return []
  }
}

// Adds a record once: a second attempt with the same session id (a second tab, a repeated event) changes nothing.
export function appendRecord(userId, record, storage = defaultStorage()) {
  const log = readLog(userId, storage)
  if (log.some((r) => r.id === record.id)) return false
  try {
    storage?.setItem(logKey(userId), JSON.stringify([...log, record].slice(-MAX_RECORDS)))
    return true
  } catch {
    return false
  }
}

// The active session as it is now, with anything that has finished while nobody was watching closed into the log first.
// Returns { session, record } where `record` is set only when this call is the one that closed it.
export function loadActive(userId, now, storage = defaultStorage()) {
  const raw = readActiveRaw(userId, storage)
  if (raw === null) return { session: null, record: null }
  const { session, record } = restoreSession(raw, now)
  if (session) return { session, record: null }
  clearActive(userId, storage) // finished, stale or unusable: it is not an active session any more
  const added = record ? appendRecord(userId, record, storage) : false
  return { session: null, record: added ? record : null }
}
