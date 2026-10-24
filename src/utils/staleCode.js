// A page's code file can be gone because the site was updated while this tab was open. Reloading once fetches the new site;
// a second failure within half a minute is shown to the person instead, so it can never loop.
export const STALE_CODE = /dynamically imported module|importing a module script failed|error loading dynamically|Unable to preload/i
const RELOAD_KEY = 'arcloop.chunk-reload'

export function reloadOnceForNewVersion() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
    if (Date.now() - last < 30_000) return false
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    return false
  }
  window.location.reload()
  return true
}
