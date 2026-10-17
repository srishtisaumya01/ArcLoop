import { defineConfig } from '@playwright/test'

// Real-browser tests for the signed-in screens. They run the real app in Chromium against the real dev
// server; sign-in and data come from an in-memory stub of the Supabase REST and auth endpoints
// (e2e/support/stubApi.js), so they prove the UI, routing, forms and client behaviour in a browser,
// NOT a hosted Supabase project. The two VITE_ values below are fake and only make the app treat
// Supabase as configured; they are never real credentials.
const PORT = 5200
const API = 'http://127.0.0.1:54321'

export default defineConfig({
  testDir: 'e2e',
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: true,
  retries: 0,
  workers: 2, // the dev server and Chromium share the machine; more workers made timing-sensitive specs flaky
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: `node node_modules/vite/bin/vite.js --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 60000,
    env: { VITE_SUPABASE_URL: API, VITE_SUPABASE_ANON_KEY: 'e2e-fake-public-key-not-a-credential' },
  },
})
