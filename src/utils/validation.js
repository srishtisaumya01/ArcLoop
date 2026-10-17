// Client-side form validators. Return an error message, or undefined when valid.
// The backend (Phase 3) must repeat any rule that matters for security.

export const PASSWORD_MIN_LENGTH = 8

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function validateEmail(value) {
  const v = (value ?? '').trim()
  if (!v) return 'Enter your email address.'
  if (!EMAIL_PATTERN.test(v)) return 'Enter a valid email address, like name@example.com.'
  return undefined
}

export function validateNewPassword(value) {
  if (!value) return 'Create a password.'
  if (value.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`
  return undefined
}

export function validateRequired(value, message) {
  return (value ?? '').trim() ? undefined : message
}
