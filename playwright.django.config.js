import { defineConfig } from '@playwright/test'

// Real-browser tests against the REAL Django API (not a stub): the Vite dev server is built with
// VITE_BACKEND=django and talks across origins (127.0.0.1:5300 -> 127.0.0.1:8100), so CORS is genuinely
// exercised. The API runs on a throwaway SQLite file (see e2e-django/support/startDjango.mjs).
// Run with `npm run test:e2e:django`. Needs the backend virtualenv and Chromium.
const WEB = 5300
const API = 8100

export default defineConfig({
  testDir: 'e2e-django',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false, // one API process and one database: keep the order predictable
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${WEB}`, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: [
    {
      command: 'node e2e-django/support/startDjango.mjs',
      url: `http://127.0.0.1:${API}/api/v1/auth/me/`,
      // Unauthenticated, so the API answers 401: any HTTP answer means it is up.
      ignoreHTTPSErrors: true,
      reuseExistingServer: false,
      timeout: 90000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    },
    {
      command: `node node_modules/vite/bin/vite.js --port ${WEB} --strictPort --host 127.0.0.1`,
      url: `http://127.0.0.1:${WEB}/`,
      reuseExistingServer: false,
      timeout: 60000,
      env: { VITE_BACKEND: 'django', VITE_API_BASE_URL: `http://127.0.0.1:${API}/api/v1` },
    },
  ],
})
