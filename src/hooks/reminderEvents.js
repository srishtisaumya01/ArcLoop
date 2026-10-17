// Lets screens tell the reminder scheduler that reminders or settings changed, so it reloads at once.
export const REMINDERS_CHANGED = 'arcloop:reminders-changed'

export function notifyRemindersChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(REMINDERS_CHANGED))
}
