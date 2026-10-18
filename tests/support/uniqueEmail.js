let counter = 0

// A new address for every sign-up in the browser and integration suites, so tests never collide on one shared database.
// Digits only on purpose: the account password rules refuse a password that looks too much like the email, and a random
// base-36 stamp sometimes made an address "too similar" to the fixed test password (about 1 sign-up in 3,000). Digits can
// match at most the two digits in that password; backend/tests/test_auth.py checks every label in use against the real rules.
export const uniqueEmail = (label) => `${label}-${Date.now()}${(counter += 1)}@example.com`
