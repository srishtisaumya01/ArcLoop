// Builds the app for the CSP browser tests and serves the PRODUCTION build with the real security headers
// (deploy/securityHeaders.js) enforced. The app calls `/api/...` on its own origin (the recommended layout), so the policy
// needs nothing beyond 'self'; the tests answer those calls with an in-memory stub. Playwright runs this as its webServer.
// CSP_MODE=report-only serves the same policy without enforcing it.
import { spawn, spawnSync } from 'node:child_process'

const PORT = process.env.CSP_PORT ?? '5400'
const vite = 'node_modules/vite/bin/vite.js'

const build = spawnSync('node', [vite, 'build', '--outDir', 'dist-csp', '--emptyOutDir'], {
  env: { ...process.env },
  stdio: 'inherit',
})
if (build.status !== 0) process.exit(build.status ?? 1)

const server = spawn('node', [vite, 'preview', '--outDir', 'dist-csp', '--port', PORT, '--strictPort', '--host', '127.0.0.1'], {
  env: { ...process.env, CSP_PREVIEW: '1' },
  stdio: 'inherit',
})
const stop = () => server.kill()
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
process.on('exit', stop)
server.on('exit', (code) => process.exit(code ?? 0))
