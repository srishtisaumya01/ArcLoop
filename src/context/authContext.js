import { createContext } from 'react'

// Value shape: { status, session, user, signOut }
// status: 'loading' | 'authenticated' | 'unauthenticated' | 'unconfigured'
export const AuthContext = createContext(null)
