// Lets the profile screens tell the planner views and the reminder scheduler that the timezone may
// have changed, so "today", the week and reminder times are recomputed at once.
export const PROFILE_CHANGED = 'arcloop:profile-changed'

export function notifyProfileChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PROFILE_CHANGED))
}
