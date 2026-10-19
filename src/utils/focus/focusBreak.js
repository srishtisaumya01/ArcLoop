// A gentle, optional suggestion after a long stretch of focus. Nothing is scheduled or sent: it is a sentence in the session summary, and
// the person decides. The thresholds are a choice, not a measured value: the timer's longest session is 60 minutes.
const MINUTE = 60 * 1000
export const LONG_STRETCH_MS = 45 * MINUTE
export const VERY_LONG_STRETCH_MS = 60 * MINUTE

// focusedMs: the time actually focused in the session (not the time planned). Returns null when no suggestion is due.
export function breakSuggestion(focusedMs) {
  if (!(focusedMs >= LONG_STRETCH_MS)) return null
  const minutes = focusedMs >= VERY_LONG_STRETCH_MS ? 10 : 5
  return { minutes, text: `That was a long stretch. A break of about ${minutes} minutes away from the screen would help, if you like.` }
}
