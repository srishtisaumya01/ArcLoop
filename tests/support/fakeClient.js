import { createQueryBuilder, shapeResult } from './queryBuilder.js'

// MOCKED data client for unit tests. `handler(state)` returns { rows } or { error }; every
// call is recorded in `calls`. This proves how the service behaves around answers it is given
// (validation, error mapping, no false success). It proves nothing about the real server:
// see the backend suite and tests/integration for that.
export function createFakeClient({ userId = '11111111-1111-4111-8111-111111111111', timeZone = 'America/New_York', handler = () => ({ rows: [] }), sessionError = null, signedOut = false, profileMissing = false } = {}) {
  const calls = []
  return {
    calls,
    auth: {
      getSession: async () => {
        if (sessionError) return { data: { session: null }, error: sessionError }
        return { data: { session: signedOut ? null : { user: { id: userId } } }, error: null }
      },
    },
    from(table) {
      return createQueryBuilder(table, async (state) => {
        calls.push(state)
        if (table === 'profiles' && state.op === 'select') {
          if (profileMissing) return shapeResult([], state)
          const custom = await handler(state)
          if (custom && custom.error) return { data: null, error: custom.error }
          return shapeResult([{ timezone: timeZone }], state)
        }
        const answer = (await handler(state)) ?? { rows: [] }
        if (answer.error) return { data: null, error: answer.error }
        if (answer.throws) throw answer.throws
        return shapeResult(answer.rows ?? [], state)
      })
    },
  }
}

export const writes = (client) => client.calls.filter((c) => c.op !== 'select')
