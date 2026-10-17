// Thin wrapper over the browser Notification API. Delivery works only while the page is open in a
// browser tab: there is no service worker or push service, so nothing can arrive when the site is
// closed. The permission prompt is only ever shown from requestPermission(), which the settings
// screen calls from an explicit button click.
//
// States: 'unsupported' | 'default' (not asked yet) | 'granted' | 'denied'.
// `env` is injectable for tests.
export function permissionState(env = globalThis) {
  const Notification = env.Notification
  if (!Notification) return 'unsupported'
  return Notification.permission === 'granted' || Notification.permission === 'denied' ? Notification.permission : 'default'
}

// Asks once. If the user already answered (or the browser has no support) nothing is shown.
export async function requestPermission(env = globalThis) {
  if (permissionState(env) !== 'default') return permissionState(env)
  const Notification = env.Notification
  try {
    // Older Safari takes a callback instead of returning a promise.
    await new Promise((resolve) => {
      const result = Notification.requestPermission(resolve)
      if (result && typeof result.then === 'function') result.then(resolve, resolve)
    })
  } catch {
    // Fall through to whatever the browser now reports.
  }
  return permissionState(env)
}

// Shows a system notification if (and only if) permission was granted. Returns whether one was
// shown; some mobile browsers refuse `new Notification` outside a service worker, in which case the
// in-app notice is the delivery.
export function showNotification({ title, body, tag }, env = globalThis) {
  if (permissionState(env) !== 'granted') return false
  try {
    new env.Notification(title, { body, tag })
    return true
  } catch {
    return false
  }
}
