import { describe, expect, it } from 'vitest'
import { DISPLAY_NAME_MAX, detectDeviceTimeZone, timeZoneOptions, validateProfileInput } from '../../src/utils/profile.js'

const intlReporting = (zone) => ({ DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: zone }) }) })

describe('detectDeviceTimeZone', () => {
  it('returns the device zone when the planner accepts it', () => {
    expect(detectDeviceTimeZone(intlReporting('Asia/Kolkata'))).toBe('Asia/Kolkata')
    expect(detectDeviceTimeZone(intlReporting('UTC'))).toBe('UTC')
  })

  it('reports the modern name for zones browsers still report by an older one', () => {
    expect(detectDeviceTimeZone(intlReporting('Asia/Calcutta'))).toBe('Asia/Kolkata')
    expect(timeZoneOptions({ intl: { supportedValuesOf: () => ['Asia/Calcutta', 'Europe/Kiev'] } })).toEqual(['Asia/Kolkata', 'Europe/Kyiv', 'UTC'])
  })

  it('returns null when the browser reports nothing usable', () => {
    expect(detectDeviceTimeZone(intlReporting(undefined))).toBeNull()
    expect(detectDeviceTimeZone(intlReporting('Mars/Base'))).toBeNull()
    expect(detectDeviceTimeZone({ DateTimeFormat: () => { throw new Error('no intl') } })).toBeNull()
  })

  it('works with the real Intl in this environment', () => {
    const zone = detectDeviceTimeZone()
    expect(zone === null || typeof zone === 'string').toBe(true)
  })
})

describe('timeZoneOptions', () => {
  const intl = { supportedValuesOf: () => ['Europe/London', 'Asia/Kolkata', 'Not/AZone'] }

  it('lists UTC, known zones, and the current and device zones once, sorted, valid only', () => {
    const list = timeZoneOptions({ current: 'America/New_York', device: 'Asia/Kolkata', intl })
    expect(list).toEqual(['America/New_York', 'Asia/Kolkata', 'Europe/London', 'UTC'])
  })

  it('still offers UTC and the current zone when the browser cannot list zones', () => {
    expect(timeZoneOptions({ current: 'Asia/Tokyo', intl: {} })).toEqual(['Asia/Tokyo', 'UTC'])
    expect(timeZoneOptions({ current: 'Asia/Tokyo', intl: { supportedValuesOf: () => { throw new Error('x') } } })).toEqual(['Asia/Tokyo', 'UTC'])
  })
})

describe('validateProfileInput', () => {
  it('only validates and returns the fields that were passed', () => {
    expect(validateProfileInput({ timezone: 'Asia/Kolkata' })).toEqual({ ok: true, value: { timezone: 'Asia/Kolkata' }, errors: {} })
    expect(validateProfileInput({ displayName: '  Asha ' }).value).toEqual({ display_name: 'Asha' })
    expect(validateProfileInput({ displayName: '   ' }).value).toEqual({ display_name: null }) // clearing the name is allowed
  })

  it('rejects an unknown timezone, an over-long name, and an empty update', () => {
    expect(validateProfileInput({ timezone: 'Mars/Base' }).errors.timezone).toBeTruthy()
    expect(validateProfileInput({ timezone: 'utc' }).errors.timezone).toBeTruthy() // must match the database spelling
    expect(validateProfileInput({ displayName: 'x'.repeat(DISPLAY_NAME_MAX + 1) }).errors.displayName).toBeTruthy()
    expect(validateProfileInput({ displayName: 'x'.repeat(DISPLAY_NAME_MAX) }).ok).toBe(true)
    expect(validateProfileInput({}).errors.form).toBeTruthy()
    expect(validateProfileInput().ok).toBe(false)
  })

  it('accepts only private or public visibility, and keeps the two settings separate', () => {
    expect(validateProfileInput({ progressVisibility: 'public' })).toEqual({ ok: true, value: { progress_visibility: 'public' }, errors: {} })
    expect(validateProfileInput({ profileVisibility: 'private', progressVisibility: 'private' }).value).toEqual({ profile_visibility: 'private', progress_visibility: 'private' })
    expect(validateProfileInput({ profileVisibility: 'friends' }).errors.profileVisibility).toBeTruthy()
    expect(validateProfileInput({ progressVisibility: 'PUBLIC' }).errors.progressVisibility).toBeTruthy()
    expect(validateProfileInput({ profileVisibility: null }).ok).toBe(false)
  })
})
