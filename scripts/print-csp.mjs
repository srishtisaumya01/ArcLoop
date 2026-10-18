// Prints the frontend security headers for a given API address, to paste into the frontend host's configuration:
//   npm run csp:print -- [https://api.example.com/api/v1] [--report-only] [--https]
// With no address the API is assumed to share the app's origin (`/api/` routed to Django): the recommended layout.
import { originOf, securityHeaders } from '../deploy/securityHeaders.js'

const args = process.argv.slice(2)
const api = args.find((a) => !a.startsWith('--'))
const apiOrigin = api ? originOf(api) : undefined // a different origin only if the API is not served from the app's own
const headers = securityHeaders({
  apiOrigin,
  reportUri: `${apiOrigin ?? ''}/api/v1/csp-report/`,
  mode: args.includes('--report-only') ? 'report-only' : 'enforce',
  httpsOnly: args.includes('--https'),
})
for (const [name, value] of Object.entries(headers)) console.log(`${name}: ${value}`)
