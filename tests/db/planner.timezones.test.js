import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { isValidTimeZone, localDateOf, zonedDateTimeToInstant } from '../../src/utils/planner/timeZones.js'

// Cross-checks the JavaScript timezone helpers against PostgreSQL (PGlite) so the
// claim "JS matches the database" is backed by data, not assumed. Only the
// listed zones, dates and times are covered. The PGlite build's tz database and
// Node's ICU data are separate copies; a mismatch for a future rule change would
// show up here as a failure rather than pass silently.
let db

beforeAll(async () => {
  db = new PGlite()
}, 60000)
afterAll(async () => {
  await db?.close()
})

const ZONES = [
  'America/New_York',
  'Europe/London',
  'Australia/Lord_Howe', // 30-minute DST shift
  'America/Havana', // DST starts at local midnight (00:00 does not exist)
  'Asia/Kolkata', // no DST, +05:30
  'Pacific/Auckland', // southern hemisphere
  'Australia/Sydney',
  'UTC',
]
// Times chosen to land inside spring-forward gaps and fall-back overlaps.
const TIMES = ['00:00', '00:30', '01:00', '01:30', '02:00', '02:15', '02:30', '03:00', '03:30', '12:00']

const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z')

describe('zonedDateTimeToInstant matches PostgreSQL for every day of 2026', () => {
  it.each(ZONES)('%s', async (zone) => {
    const { rows } = await db.query(
      `select to_char(d, 'YYYY-MM-DD') as date, t as time,
              to_char(((d + t::time)::timestamp at time zone $1) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as instant
         from generate_series(date '2026-01-01', date '2026-12-31', interval '1 day') as d,
              unnest($2::text[]) as t`,
      [zone, TIMES],
    )
    expect(rows).toHaveLength(365 * TIMES.length)
    const mismatches = rows
      .map((r) => ({ ...r, js: iso(zonedDateTimeToInstant(r.date, r.time, zone)) }))
      .filter((r) => r.js !== r.instant)
    expect(mismatches.slice(0, 5)).toEqual([])
  }, 60000)
})

describe('localDateOf matches PostgreSQL for hourly instants across 2026', () => {
  it.each(ZONES)('%s', async (zone) => {
    const { rows } = await db.query(
      `select to_char(i at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as instant,
              to_char(i at time zone $1, 'YYYY-MM-DD') as local_date
         from generate_series(timestamptz '2026-01-01 00:00+00', timestamptz '2026-12-31 23:00+00', interval '30 minutes') as i`,
      [zone],
    )
    const mismatches = rows.filter((r) => localDateOf(r.instant, zone) !== r.local_date)
    expect(rows.length).toBeGreaterThan(17000)
    expect(mismatches.slice(0, 5)).toEqual([])
  }, 60000)
})

describe('timezone name validation agrees with pg_timezone_names', () => {
  const NAMES = [
    'UTC', 'GMT', 'EST', 'America/New_York', 'Europe/London', 'Asia/Kolkata', 'Asia/Calcutta',
    'Australia/Lord_Howe', 'America/Argentina/Buenos_Aires', 'America/Port-au-Prince', 'Etc/GMT+5',
    'US/Eastern', 'Pacific/Auckland',
    // must be rejected: wrong case, junk, offsets, whitespace
    'utc', 'america/new_york', 'America/new_york', 'America/New_york', 'asia/kolkata', 'Mars/Olympus',
    '', ' UTC', 'UTC ', '+05:30', 'America/', '/UTC',
  ]

  it('accepts every name the database knows and rejects every name it does not', async () => {
    const { rows } = await db.query(`select n, exists(select 1 from pg_timezone_names where name = n) as known from unnest($1::text[]) as n`, [NAMES])
    const disagreements = rows
      .map((r) => ({ name: r.n, database: r.known, js: isValidTimeZone(r.n) }))
      .filter((r) => r.database !== r.js)
    expect(disagreements).toEqual([])
  })
})
