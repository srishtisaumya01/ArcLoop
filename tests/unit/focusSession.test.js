import { describe, expect, it } from 'vitest'
import {
  GAP_MS, PRESET_MINUTES, STALE_PAUSE_MS, completedRecord, dropGap, elapsedMs, endedEarlyRecord, formatClock, gapMs, hasGap, isFinished, keepGap,
  markGap, pauseSession, progressFraction, remainingMs, restoreSession, resumeSession, startSession, wholeMinutes,
} from '../../src/utils/focus/focusSession.js'

// The timer's rules as functions of a saved session and a clock reading. Every time below is a plain number of milliseconds, so nothing
// depends on real time passing.
const MIN = 60 * 1000
const T0 = 1_800_000_000_000
const begin = (minutes = 25, now = T0) => startSession({ id: 's1', taskId: 't1', planDate: '2026-03-10', title: 'Write the report', minutes, now })

describe('starting', () => {
  it('offers 15, 25, 45 and 60 minutes, and refuses any other length', () => {
    expect(PRESET_MINUTES).toEqual([15, 25, 45, 60])
    for (const m of PRESET_MINUTES) expect(begin(m).plannedMs).toBe(m * MIN)
    expect(() => begin(30)).toThrow(/15, 25, 45, 60/)
  })

  it('starts running, with nothing focused yet, tied to its task and day', () => {
    const s = begin(25)
    expect(s).toMatchObject({ status: 'running', taskId: 't1', planDate: '2026-03-10', title: 'Write the report', accumulatedMs: 0, segmentStartedAt: T0 })
    expect(elapsedMs(s, T0)).toBe(0)
    expect(remainingMs(s, T0)).toBe(25 * MIN)
  })
})

describe('time is worked out from timestamps', () => {
  it('counts the time since the start, however long ago the page last looked', () => {
    const s = begin(25)
    expect(elapsedMs(s, T0 + 10 * MIN)).toBe(10 * MIN)
    expect(remainingMs(s, T0 + 10 * MIN)).toBe(15 * MIN)
    expect(progressFraction(s, T0 + 10 * MIN)).toBeCloseTo(0.4)
  })

  it('never shows more than the planned time, and knows when it is over', () => {
    const s = begin(15)
    expect(isFinished(s, T0 + 14 * MIN)).toBe(false)
    expect(isFinished(s, T0 + 15 * MIN)).toBe(true)
    expect(elapsedMs(s, T0 + 3 * 60 * MIN)).toBe(15 * MIN)
    expect(remainingMs(s, T0 + 3 * 60 * MIN)).toBe(0)
  })

  it('ignores a clock that went backwards', () => {
    expect(elapsedMs(begin(25), T0 - 5 * MIN)).toBe(0)
  })
})

describe('pausing and resuming', () => {
  it('does not count paused time', () => {
    const paused = pauseSession(begin(25), T0 + 10 * MIN)
    expect(paused).toMatchObject({ status: 'paused', accumulatedMs: 10 * MIN, segmentStartedAt: null, pausedAt: T0 + 10 * MIN })
    expect(elapsedMs(paused, T0 + 10 * MIN)).toBe(10 * MIN)
    expect(elapsedMs(paused, T0 + 5 * 60 * MIN)).toBe(10 * MIN) // hours later, still 10 minutes
    const resumed = resumeSession(paused, T0 + 40 * MIN)
    expect(resumed.status).toBe('running')
    expect(elapsedMs(resumed, T0 + 45 * MIN)).toBe(15 * MIN) // 10 before the pause + 5 after
  })

  it('pausing a paused session, or resuming a running one, changes nothing', () => {
    const running = begin(25)
    const paused = pauseSession(running, T0 + MIN)
    expect(resumeSession(running, T0 + 2 * MIN)).toBe(running)
    expect(pauseSession(paused, T0 + 2 * MIN)).toBe(paused)
  })

  it('a paused session never finishes by itself', () => {
    const paused = pauseSession(begin(15), T0 + 5 * MIN)
    expect(isFinished(paused, T0 + 10 * 60 * MIN)).toBe(false)
  })
})

describe('the two ways a session ends', () => {
  it('a full session is completed, with the whole time focused, ending when the time ran out', () => {
    const record = completedRecord(begin(25), T0 + 3 * 60 * MIN)
    expect(record).toMatchObject({ outcome: 'completed', focusedMs: 25 * MIN, plannedMs: 25 * MIN, taskId: 't1', planDate: '2026-03-10', startedAt: T0, endedAt: T0 + 25 * MIN })
  })

  it('a session with a pause finishes later, by the paused time', () => {
    const resumed = resumeSession(pauseSession(begin(25), T0 + 10 * MIN), T0 + 40 * MIN)
    expect(completedRecord(resumed, T0 + 120 * MIN).endedAt).toBe(T0 + 55 * MIN) // 15 minutes were left when it resumed at 40
  })

  it('ending early keeps exactly what was focused, not the paused time and not the plan', () => {
    const resumed = resumeSession(pauseSession(begin(45), T0 + 12 * MIN), T0 + 30 * MIN)
    const record = endedEarlyRecord(resumed, T0 + 38 * MIN) // 12 before the pause, 8 after
    expect(record).toMatchObject({ outcome: 'ended_early', focusedMs: 20 * MIN, plannedMs: 45 * MIN, endedAt: T0 + 38 * MIN })
  })

  it('ending "early" when the time was already used up is a completed session', () => {
    expect(endedEarlyRecord(begin(15), T0 + 20 * MIN).outcome).toBe('completed')
  })
})

describe('restoring a saved session', () => {
  const saved = (s) => JSON.stringify(s)

  it('a running session after a reload has the time left that the clock says', () => {
    const { session, record } = restoreSession(saved(begin(25)), T0 + 7 * MIN)
    expect(record).toBeNull()
    expect(remainingMs(session, T0 + 7 * MIN)).toBe(18 * MIN)
  })

  it('a paused session stays paused, with the same time left, however long the page was closed', () => {
    const { session } = restoreSession(saved(pauseSession(begin(25), T0 + 10 * MIN)), T0 + 3 * 60 * MIN)
    expect(session.status).toBe('paused')
    expect(remainingMs(session, T0 + 3 * 60 * MIN)).toBe(15 * MIN)
  })

  it('a session that ran out while the page was closed comes back as a completed record that ended on time', () => {
    const { session, record } = restoreSession(saved(begin(15)), T0 + 5 * 60 * MIN)
    expect(session).toBeNull()
    expect(record).toMatchObject({ outcome: 'completed', focusedMs: 15 * MIN, endedAt: T0 + 15 * MIN })
  })

  it('a session left paused for more than a day is closed as ended early with what it had', () => {
    const paused = pauseSession(begin(25), T0 + 10 * MIN)
    const { session, record } = restoreSession(saved(paused), paused.pausedAt + STALE_PAUSE_MS + 1)
    expect(session).toBeNull()
    expect(record).toMatchObject({ outcome: 'ended_early', focusedMs: 10 * MIN, endedAt: paused.pausedAt })
  })

  it('unusable text is dropped, never thrown on', () => {
    const good = begin(25)
    const cases = [
      'not json', '', 'null', '[]', '42', '{}',
      saved({ ...good, v: 2 }), saved({ ...good, id: '' }), saved({ ...good, taskId: 5 }), saved({ ...good, planDate: 'tomorrow' }),
      saved({ ...good, plannedMs: 31 * MIN }), saved({ ...good, plannedMs: Number.NaN }), saved({ ...good, status: 'stopped' }),
      saved({ ...good, accumulatedMs: -1 }), saved({ ...good, accumulatedMs: 26 * MIN }), saved({ ...good, segmentStartedAt: 'now' }),
      saved({ ...pauseSession(good, T0 + MIN), pausedAt: undefined }),
    ]
    for (const raw of cases) expect(restoreSession(raw, T0 + MIN), String(raw).slice(0, 60)).toEqual({ session: null, record: null })
  })
})

describe('what the screen shows', () => {
  it('formats the countdown as minutes and seconds, rounding up so time left never reads 00:00', () => {
    expect(formatClock(25 * MIN)).toBe('25:00')
    expect(formatClock(61 * 1000)).toBe('01:01')
    expect(formatClock(500)).toBe('00:01')
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(-5)).toBe('00:00')
  })

  it('rounds focused time to whole minutes', () => {
    expect(wholeMinutes(25 * MIN)).toBe(25)
    expect(wholeMinutes(90 * 1000)).toBe(2)
  })
})

describe('a gap in the timer (the computer slept, the page was frozen)', () => {
  // A 45 minute session, seen up to minute 5, not seen again until minute 45 (so the whole session would have run out unseen).
  const seen = (m) => T0 + m * MIN
  const gapped = () => markGap(begin(45), seen(5))

  it('is two looks more than two minutes apart', () => {
    expect(GAP_MS).toBe(2 * MIN)
  })

  it('marks the time since the timer was last seen as not yet counted, and stands the clock still there', () => {
    const s = gapped()
    expect(hasGap(s)).toBe(true)
    expect(s.gapFrom).toBe(seen(5))
    expect(elapsedMs(s, seen(45))).toBe(5 * MIN) // not 45
    expect(remainingMs(s, seen(45))).toBe(40 * MIN)
    expect(isFinished(s, seen(300))).toBe(false) // however long, it does not finish by itself
    expect(gapMs(s, seen(45))).toBe(40 * MIN)
  })

  it('does nothing to a session with no gap, a paused one, or one that already has a gap waiting', () => {
    expect(hasGap(begin(25))).toBe(false)
    expect(gapMs(begin(25), seen(30))).toBe(0)
    const paused = pauseSession(begin(25), seen(3))
    expect(markGap(paused, seen(1))).toBe(paused)
    const first = gapped()
    expect(markGap(first, seen(20))).toBe(first) // the first gap stands; it is not moved later
  })

  it('never starts a gap before the running stretch began', () => {
    const resumed = resumeSession(pauseSession(begin(45), seen(10)), seen(30))
    expect(markGap(resumed, seen(12)).gapFrom).toBe(seen(30))
  })

  it('"Yes, count it" keeps the whole time', () => {
    const kept = keepGap(gapped())
    expect(hasGap(kept)).toBe(false)
    expect(elapsedMs(kept, seen(40))).toBe(40 * MIN) // the gap counts as focus
    expect(isFinished(kept, seen(45))).toBe(true)
    expect(completedRecord(kept, seen(45))).toMatchObject({ outcome: 'completed', focusedMs: 45 * MIN })
  })

  it('"No, don’t count it" leaves the gap out and carries on from now with what was seen', () => {
    const dropped = dropGap(gapped(), seen(45))
    expect(hasGap(dropped)).toBe(false)
    expect(dropped).toMatchObject({ status: 'running', accumulatedMs: 5 * MIN, segmentStartedAt: seen(45) })
    expect(elapsedMs(dropped, seen(45))).toBe(5 * MIN)
    expect(remainingMs(dropped, seen(50))).toBe(35 * MIN) // 5 seen + 5 more since
    expect(isFinished(dropped, seen(50))).toBe(false)
    expect(isFinished(dropped, seen(85))).toBe(true) // 40 more minutes to go from minute 45
  })

  it('keep and drop do nothing when there is no gap', () => {
    const s = begin(25)
    expect(keepGap(s)).toBe(s)
    expect(dropGap(s, seen(10))).toBe(s)
  })

  it('ending the session while the gap waits keeps only the time that was seen', () => {
    const record = endedEarlyRecord(gapped(), seen(45))
    expect(record).toMatchObject({ outcome: 'ended_early', focusedMs: 5 * MIN })
  })

  it('pausing while the gap waits keeps only the time that was seen, and the gap is gone', () => {
    const paused = pauseSession(gapped(), seen(45))
    expect(paused).toMatchObject({ status: 'paused', accumulatedMs: 5 * MIN, gapFrom: null })
    expect(hasGap(paused)).toBe(false)
    expect(elapsedMs(resumeSession(paused, seen(50)), seen(60))).toBe(15 * MIN)
  })

  it('a gap waiting for an answer survives a reload, and is not closed as completed even though the time has long run out', () => {
    const { session, record } = restoreSession(JSON.stringify(gapped()), seen(600))
    expect(record).toBeNull()
    expect(hasGap(session)).toBe(true)
    expect(remainingMs(session, seen(600))).toBe(40 * MIN)
  })

  it('a session saved without a gap (before this existed) restores as it always did', () => {
    const old = { ...begin(25) }
    delete old.gapFrom
    expect(restoreSession(JSON.stringify(old), seen(10)).session.gapFrom).toBeNull()
    expect(restoreSession(JSON.stringify(old), seen(200)).record.outcome).toBe('completed')
  })

  it('a damaged gap marker makes the whole session unusable rather than guessed at', () => {
    expect(restoreSession(JSON.stringify({ ...begin(25), gapFrom: 'soon' }), seen(1))).toEqual({ session: null, record: null })
  })

  it('a paused session carries no gap, whatever was saved', () => {
    const odd = { ...pauseSession(begin(25), seen(3)), gapFrom: seen(2) }
    expect(restoreSession(JSON.stringify(odd), seen(4)).session.gapFrom).toBeNull()
  })
})
