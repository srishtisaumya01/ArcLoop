import { afterEach } from 'vitest'
import { cleanup, configure } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Lazy-loaded routes are transformed on first import, which can exceed the 1s default.
configure({ asyncUtilTimeout: 5000 })

// Vitest globals are off, so Testing Library cannot auto-register cleanup.
afterEach(() => cleanup())

// jsdom does not implement scrolling. (Some test files run in the node environment.)
if (typeof window !== 'undefined') {
  window.scrollTo = () => {}
  Element.prototype.scrollIntoView = () => {}
}
