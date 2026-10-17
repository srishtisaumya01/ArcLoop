import { PLANNER_CONFIG } from './constants.js'
import { assertTimeZone, localDateOf, toInstantMs } from './timeZones.js'

// Every planner function that needs the current time takes `{ now, timeZone, config? }`
// explicitly. Nothing reads the system clock, so results are deterministic.
export function resolveContext({ now, timeZone, config } = {}) {
  assertTimeZone(timeZone)
  const nowMs = toInstantMs(now)
  return {
    nowMs,
    nowIso: new Date(nowMs).toISOString(),
    timeZone,
    today: localDateOf(nowMs, timeZone),
    config: { ...PLANNER_CONFIG, ...config },
  }
}
