import { DEMO_CHALLENGES } from '../constants/demoChallenges.js'

// DEMO IMPLEMENTATION. Reads sample data from constants. Phase 5 replaces the
// bodies with API calls; the function signatures are the contract the UI
// depends on. The short delay lets loading states behave as they will with a
// real network.
const LATENCY_MS = 350
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function listChallenges() {
  await wait(LATENCY_MS)
  return DEMO_CHALLENGES.map((c) => ({ ...c }))
}

// Resolves to the challenge, or null when no challenge has that slug.
export async function getChallenge(slug) {
  await wait(LATENCY_MS)
  const found = DEMO_CHALLENGES.find((c) => c.slug === slug)
  return found ? { ...found } : null
}
