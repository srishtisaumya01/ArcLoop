import { waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// `userEvent.setup()` for the integration tests. A real person cannot press a control the screen is still
// busy with, and neither can this: before clicking or typing it waits until the element is enabled. Without
// it a test would click the instant after the previous click, while the server round trip is still in flight
// (the screen disables its buttons meanwhile), which the earlier in-process database never exposed.
const WAITS = new Set(['click', 'dblClick', 'type', 'clear', 'selectOptions', 'upload', 'keyboard'])

const usable = (el) => {
  if (!(el instanceof Element)) return true
  if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false
  return getComputedStyle(el).pointerEvents !== 'none'
}

export function setupUser(options) {
  const user = userEvent.setup(options)
  return new Proxy(user, {
    get(target, key) {
      const value = target[key]
      if (typeof value !== 'function') return value
      if (!WAITS.has(key)) return value.bind(target)
      return async (element, ...rest) => {
        await waitFor(() => {
          if (!usable(element)) throw new Error('the control is still busy')
        })
        return value.call(target, element, ...rest)
      }
    },
  })
}
