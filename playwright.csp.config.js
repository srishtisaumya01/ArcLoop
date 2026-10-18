import { defineConfig } from '@playwright/test'

// Runs the PRODUCTION build under the enforced Content-Security-Policy (see deploy/securityHeaders.js) and fails on any
// violation. The API is the in-memory stub (e2e/support/stubApi.js): this proves what the policy allows and blocks
// in Chromium, not that a deployed host sends the headers (the host must, see docs/DEPLOYMENT.md).
const PORT = 5400

export default defineConfig({
  testDir: 'e2e-csp',
  timeout: 60000,
  expect: { timeout: 10000 },
  workers: 2,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'node scripts/serve-csp.mjs',
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
  },
})
