import { useEffect, useMemo, useState } from 'react'
import { AuthContext } from './authContext.js'
import { getSession, onAuthStateChange, signOut } from '../services/authService.js'
import { isBackendConfigured } from '../services/backend.js'

const initialState = {
  status: isBackendConfigured ? 'loading' : 'unconfigured',
  session: null,
}

const fromSession = (session) => ({ status: session ? 'authenticated' : 'unauthenticated', session })

// Restores the session on load and keeps it in sync with sign-in, sign-out
// and expiry (the server stopped accepting the cookie).
export default function AuthProvider({ children }) {
  const [state, setState] = useState(initialState)

  useEffect(() => {
    if (!isBackendConfigured) return undefined
    let active = true

    // getSession() asks the server who the session cookie belongs to; its answer is final. (If the server cannot be
    // reached it rejects and the signed-out state is shown; reloading with a connection restores the session.)
    getSession().then(
      (session) => active && setState(fromSession(session)),
      () => active && setState(fromSession(null)),
    )
    const unsubscribe = onAuthStateChange((_event, session) => {
      if (active) setState(fromSession(session))
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const value = useMemo(() => ({ ...state, user: state.session?.user ?? null, signOut }), [state])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
