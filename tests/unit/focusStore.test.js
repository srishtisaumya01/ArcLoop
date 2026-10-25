import { beforeEach, describe, expect, it } from 'vitest'
import { pauseSession, startSession } from '../../src/utils/focus/focusSession.js'
import { appendRecord, clearActive, focusStorageKeys, loadActive, readActiveRaw, readLog, readSeen, writeActive, writeSeen } from '../../src/utils/focus/focusStore.js'

// The saved focus session and log, against a stand-in for localStorage (so the tests also cover storage that refuses to work).
const MIN = 60 * 1000
const T0 = 1_800_000_000_000
const USER = 'user-1'
const session = (over = {}) => ({ ...startSession({ id: 's1', taskId: 't1', planDate: '2026-03-10', title: 'Write', minutes: 25, now: T0 }), ...over })
const record = (over = {}) => ({ id: 'r1', taskId: 't1', planDate: '2026-03-10', title: 'Write', plannedMs: 25 * MIN, focusedMs: 25 * MIN, outcome: 'completed', startedAt: T0, endedAt: T0 + 25 * MIN, ...over })

let store
let storage
beforeEach(() => {
  store = new Map()
  storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }
})
const brokenStorage = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => { throw new Error('blocked') } }

describe('the active session', () => {
  it('is saved per person and read back', () => {
    expect(writeActive(USER, session(), storage)).toBe(true)
    expect(JSON.parse(readActiveRaw(USER, storage))).toMatchObject({ id: 's1', taskId: 't1' })
    expect(readActiveRaw('someone-else', storage)).toBeNull()
    expect(store.has(focusStorageKeys.active(USER))).toBe(true)
  })

  it('loads as a running session with its time left worked out from the clock', () => {
    writeActive(USER, session(), storage)
    const { session: loaded, record: closed } = loadActive(USER, T0 + 5 * MIN, storage)
    expect(closed).toBeNull()
    expect(loaded).toMatchObject({ id: 's1', status: 'running' })
  })

  it('a paused session loads paused', () => {
    writeActive(USER, pauseSession(session(), T0 + 5 * MIN), storage)
    expect(loadActive(USER, T0 + 9 * 60 * MIN, storage).session.status).toBe('paused')
  })

  it('one that finished while nobody looked is closed into the log once, and is no longer active', () => {
    writeActive(USER, session(), storage)
    const first = loadActive(USER, T0 + 3 * 60 * MIN, storage)
    expect(first.session).toBeNull()
    expect(first.record).toMatchObject({ id: 's1', outcome: 'completed', focusedMs: 25 * MIN })
    expect(readActiveRaw(USER, storage)).toBeNull()
    expect(readLog(USER, storage)).toHaveLength(1)
    const again = loadActive(USER, T0 + 4 * 60 * MIN, storage) // a second tab, a repeated event
    expect(again).toEqual({ session: null, record: null })
    expect(readLog(USER, storage)).toHaveLength(1)
  })

  it('damaged saved text is removed and nothing is recorded', () => {
    storage.setItem(focusStorageKeys.active(USER), '{"v":1,"id":')
    expect(loadActive(USER, T0, storage)).toEqual({ session: null, record: null })
    expect(readActiveRaw(USER, storage)).toBeNull()
    expect(readLog(USER, storage)).toEqual([])
  })

  it('can be cleared', () => {
    writeActive(USER, session(), storage)
    clearActive(USER, storage)
    expect(readActiveRaw(USER, storage)).toBeNull()
  })
})

describe('the log', () => {
  it('adds a record once: the same session id again changes nothing', () => {
    expect(appendRecord(USER, record(), storage)).toBe(true)
    expect(appendRecord(USER, record({ focusedMs: 1 }), storage)).toBe(false)
    expect(readLog(USER, storage)).toEqual([record()])
  })

  it('keeps records apart per person and ignores entries that are not well formed', () => {
    appendRecord(USER, record(), storage)
    appendRecord('user-2', record({ id: 'r2' }), storage)
    storage.setItem(focusStorageKeys.log(USER), JSON.stringify([record(), { id: 3 }, null, { ...record({ id: 'r9' }), outcome: 'abandoned' }, { ...record({ id: 'r8' }), planDate: 'x' }]))
    expect(readLog(USER, storage).map((r) => r.id)).toEqual(['r1'])
    expect(readLog('user-2', storage).map((r) => r.id)).toEqual(['r2'])
  })

  it('keeps only the latest 200 records', () => {
    for (let i = 0; i < 205; i += 1) appendRecord(USER, record({ id: `r${i}` }), storage)
    const log = readLog(USER, storage)
    expect(log).toHaveLength(200)
    expect(log[0].id).toBe('r5')
    expect(log.at(-1).id).toBe('r204')
  })

  it('reads as empty from damaged text', () => {
    storage.setItem(focusStorageKeys.log(USER), 'oops')
    expect(readLog(USER, storage)).toEqual([])
  })
})

describe('storage that does not work', () => {
  it('reports that it could not save, and never throws', () => {
    expect(writeActive(USER, session(), brokenStorage)).toBe(false)
    expect(readActiveRaw(USER, brokenStorage)).toBeNull()
    expect(readLog(USER, brokenStorage)).toEqual([])
    expect(appendRecord(USER, record(), brokenStorage)).toBe(false)
    expect(() => clearActive(USER, brokenStorage)).not.toThrow()
    expect(loadActive(USER, T0, brokenStorage)).toEqual({ session: null, record: null })
  })
})

describe('the last-seen mark shared by tabs', () => {
  it('is written and read back per person, and is empty until something writes it', () => {
    expect(readSeen(USER, storage)).toBeNull()
    writeSeen(USER, T0 + 5 * MIN, storage)
    expect(readSeen(USER, storage)).toBe(T0 + 5 * MIN)
    expect(readSeen('user-2', storage)).toBeNull()
  })

  it('goes away with the active session, and damaged text reads as nothing', () => {
    writeActive(USER, session(), storage)
    writeSeen(USER, T0 + MIN, storage)
    clearActive(USER, storage)
    expect(readSeen(USER, storage)).toBeNull()
    storage.setItem(focusStorageKeys.log(USER).replace('.log.', '.seen.'), 'soon')
    expect(readSeen(USER, storage)).toBeNull()
  })

  it('never throws when storage will not work', () => {
    expect(readSeen(USER, brokenStorage)).toBeNull()
    expect(() => writeSeen(USER, T0, brokenStorage)).not.toThrow()
  })
})
