import { createContext } from 'react'

// What the signed-in shell loads once for everything inside it: the profile, and the name to greet the person by.
export const AppShellContext = createContext({ profile: null, profileStatus: 'loading', displayName: '', reloadProfile: () => {} })
