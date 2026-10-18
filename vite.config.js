import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { securityHeaders } from './deploy/securityHeaders.js'

// The app and the API are ONE origin: the page calls `/api/...` and a reverse proxy sends that to Django (a deployment
// configures this at its web server, see docs/DEPLOYMENT.md). The dev and preview servers do the same so local
// development, the browser tests and production behave alike. Host and Origin headers are passed through unchanged, which
// Django's CSRF check relies on.
const apiProxy = { '/api': { target: process.env.ARCLOOP_API_PROXY ?? 'http://127.0.0.1:8000', changeOrigin: false } }

// `vite preview` (and only it) serves the production build with the real security headers when CSP_PREVIEW is set,
// so the browser tests can run the app under the enforced policy. A deployment sends the same headers from its host.
const previewHeaders = process.env.CSP_PREVIEW
  ? securityHeaders({ apiOrigin: process.env.CSP_API_ORIGIN, mode: process.env.CSP_MODE === 'report-only' ? 'report-only' : 'enforce' })
  : undefined

export default defineConfig({
  plugins: [react()],
  server: { proxy: apiProxy },
  preview: { headers: previewHeaders, proxy: apiProxy },
  // Never inline assets as data: URLs: the Content-Security-Policy allows fonts and images only from the app's own origin.
  build: { assetsInlineLimit: 0 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    globals: false,
    testTimeout: 20000,
    // `npx vitest run --project unit` needs nothing but Node; the integration project starts a real Django server.
    projects: [
      { extends: true, test: { name: 'unit', include: ['tests/unit/**/*.test.{js,jsx}'] } },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.{js,jsx}'],
          globalSetup: ['./tests/integration/globalSetup.js'],
          setupFiles: ['./tests/setup.js', './tests/integration/setup.js'],
          testTimeout: 60000,
          hookTimeout: 60000,
        },
      },
    ],
  },
})
