import { useContext } from 'react'
import { AppShellContext } from '../context/appShellContext.js'

export function useAppShell() {
  return useContext(AppShellContext)
}
