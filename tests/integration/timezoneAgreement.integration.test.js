// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { diffDays } from '../../src/utils/planner/localDates.js'
import { localDateOf, localDayLengthMinutes, zonedDateTimeToInstant } from '../../src/utils/planner/timeZones.js'
import { manage } from './manage.js'

// The server decides "today", the editing window and which date progress may be recorded for, using Python's timezone
// database; the app decides what to show using the browser's (Node's here). This checks they AGREE on a large, deliberately
// awkward sample (see backend/planner/management/commands/tz_samples.py for what is sampled).
//
// What this proves: agreement on those samples, in this environment, for 2026. What it does not: every zone, every year,
// future rule changes, or that either database is right (two databases of possibly different versions agreeing is evidence,
// not proof). A disagreement means a person could see one date while the server uses another.
const run = manage('tz_samples', { maxBuffer: 64 * 1024 * 1024 })
const data = run.status === 0 ? run.json() : null

describe('JavaScript and the server agree about local dates and times', () => {
  it('produced a real sample set', () => {
    expect(run.status, run.stderr).toBe(0)
    expect(data.zones).toHaveLength(16)
    expect(data.samples.length).toBeGreaterThan(30000)
    expect(data.changes).toBeGreaterThan(15) // offset changes found in 2026 across the 16 zones (several have none)
    expect(data.dayLengths.length).toBeGreaterThan(100) // five days around each change
  })

  it('names the same local calendar date at every sampled instant', () => {
    const wrong = []
    for (const [zoneIndex, epoch, date] of data.samples) {
      const zone = data.zones[zoneIndex]
      const js = localDateOf(epoch * 1000, zone)
      if (js !== date) wrong.push(`${zone} @${new Date(epoch * 1000).toISOString()}: js=${js} server=${date}`)
    }
    expect(wrong.slice(0, 10)).toEqual([])
  })

  it('converts a server local date and time back to the same instant (where the wall time is unambiguous)', () => {
    const wrong = []
    let checked = 0
    for (const [zoneIndex, epoch, date, time, isAmbiguous] of data.samples) {
      if (isAmbiguous) continue // a wall time that happens twice has no single answer; the rule (later instant) is unit-tested
      const zone = data.zones[zoneIndex]
      const [hh, mm, ss] = time.split(':').map(Number)
      const back = zonedDateTimeToInstant(date, `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, zone) / 1000
      checked += 1
      if (back !== epoch - ss) wrong.push(`${zone} ${date} ${time}: js=${back} expected=${epoch - ss}`)
    }
    expect(checked).toBeGreaterThan(30000)
    expect(wrong.slice(0, 10)).toEqual([])
  })

  it('measures the same real length for the local days around every offset change (23, 24, 25 hours, and 30/45-minute shifts)', () => {
    const wrong = []
    const lengths = new Set()
    for (const [zoneIndex, date, minutes] of data.dayLengths) {
      const zone = data.zones[zoneIndex]
      lengths.add(minutes)
      const js = localDayLengthMinutes(date, zone)
      if (js !== minutes) wrong.push(`${zone} ${date}: js=${js} server=${minutes}`)
    }
    expect(wrong.slice(0, 10)).toEqual([])
    // The sample really contains short and long days, not just ordinary ones.
    expect([...lengths].some((m) => m < 1440)).toBe(true)
    expect([...lengths].some((m) => m > 1440)).toBe(true)
  })

  it('never skips or repeats a date as time moves forward, in any sampled zone, across every change', () => {
    const byZone = new Map()
    for (const [zoneIndex, epoch] of data.samples) byZone.set(zoneIndex, [...(byZone.get(zoneIndex) ?? []), epoch])
    let pairs = 0
    for (const [zoneIndex, epochs] of byZone) {
      const zone = data.zones[zoneIndex]
      const sorted = [...epochs].sort((a, b) => a - b)
      for (let i = 1; i < sorted.length; i += 1) {
        if (sorted[i] - sorted[i - 1] > 7 * 3600) continue // only neighbouring samples: a date can legitimately jump over a longer gap
        const step = diffDays(localDateOf(sorted[i - 1] * 1000, zone), localDateOf(sorted[i] * 1000, zone))
        pairs += 1
        expect([0, 1], `${zone} ${new Date(sorted[i] * 1000).toISOString()} moved ${step} dates`).toContain(step)
      }
    }
    expect(pairs).toBeGreaterThan(20000)
  })
})
