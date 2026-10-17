// Safety guards for scripts/verify-supabase.mjs. Pure: they read an environment object and decide whether
// the real-project verification may run. Nothing here prints a secret or touches the network.
//
// The script writes test accounts and test rows, so it must only ever run against a DEDICATED, DISPOSABLE
// test project that the person has named explicitly. A project cannot be recognised as "test" from its URL,
// so the person must repeat the project ref and confirm.

import { Buffer } from 'node:buffer'

const PLACEHOLDER = /your-|example|changeme|xxxx/i

// The variables the runner reads, for the preflight report. Only names and a status are ever reported, never values.
export const REQUIRED_VARIABLES = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'ARCLOOP_TEST_PROJECT_REF', 'ARCLOOP_CONFIRM_TEST_PROJECT']

export function describeEnv(env) {
  return REQUIRED_VARIABLES.map((name) => {
    const value = (env[name] ?? '').trim()
    return { name, status: !value ? 'missing' : PLACEHOLDER.test(value) ? 'placeholder' : 'set' }
  })
}

// --env-file needs Node 20.6 or later.
export function nodeMeetsRequirement(version) {
  const [major, minor] = String(version).replace(/^v/, '').split('.').map(Number)
  return major > 20 || (major === 20 && minor >= 6)
}

// Anything VITE_-prefixed is compiled into the browser bundle, so a privileged value there would be published.
export const privilegedViteVariables = (env) => Object.keys(env).filter((name) => /^VITE_.*(SERVICE|SECRET|PASSWORD|PRIVATE)/i.test(name))

export function checkTarget(env) {
  const problems = []
  const url = (env.VITE_SUPABASE_URL ?? '').trim()
  const anonKey = (env.VITE_SUPABASE_ANON_KEY ?? '').trim()
  const declaredRef = (env.ARCLOOP_TEST_PROJECT_REF ?? '').trim()

  for (const name of privilegedViteVariables(env)) problems.push(`${name} looks like a privileged value in a VITE_ variable. VITE_ variables are shipped to the browser: remove it and never put a service-role or secret key or a password there.`)
  if (!url) problems.push('VITE_SUPABASE_URL is not set.')
  if (!anonKey) problems.push('VITE_SUPABASE_ANON_KEY is not set.')
  if (url && PLACEHOLDER.test(url)) problems.push('VITE_SUPABASE_URL is still a placeholder.')
  if (anonKey && PLACEHOLDER.test(anonKey)) problems.push('VITE_SUPABASE_ANON_KEY is still a placeholder.')

  let ref = ''
  if (url && !PLACEHOLDER.test(url)) {
    const match = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/.exec(url)
    if (!match) problems.push('VITE_SUPABASE_URL must be a hosted project URL like https://<project-ref>.supabase.co (local and custom domains are not accepted).')
    else ref = match[1]
  }

  if (!declaredRef) problems.push('ARCLOOP_TEST_PROJECT_REF is not set. Set it to the ref of the dedicated TEST project to confirm the target.')
  else if (ref && declaredRef !== ref) problems.push('ARCLOOP_TEST_PROJECT_REF does not match the project in VITE_SUPABASE_URL. Refusing to run.')
  if (env.ARCLOOP_CONFIRM_TEST_PROJECT !== 'yes') problems.push('ARCLOOP_CONFIRM_TEST_PROJECT=yes is required: confirm this is a disposable test project, never production.')

  // The runner must never be pointed at a privileged key: it tests what an ordinary signed-in user can do.
  const looksLikeServiceKey = (value) => {
    try {
      const payload = JSON.parse(Buffer.from(String(value).split('.')[1] ?? '', 'base64url').toString('utf8'))
      return payload.role === 'service_role'
    } catch {
      return false
    }
  }
  if (anonKey && looksLikeServiceKey(anonKey)) problems.push('VITE_SUPABASE_ANON_KEY is a service-role key. Use the public anon/publishable key only.')
  if (/^sb_secret_/.test(anonKey)) problems.push('VITE_SUPABASE_ANON_KEY is a secret key. Use the public anon/publishable key only.')

  return { ok: problems.length === 0, problems, ref }
}
