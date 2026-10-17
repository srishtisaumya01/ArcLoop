// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { checkTarget, describeEnv, nodeMeetsRequirement, privilegedViteVariables } from '../../scripts/lib/verificationGuards.js'

// The guards decide whether the real-project verification may run at all. These tests use made-up values only:
// no network, no real project.
const REF = 'abcdefghijklmnopqrst' // 20 lowercase letters, like a real project ref
const jwt = (role) => `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.sig`
const good = () => ({
  VITE_SUPABASE_URL: `https://${REF}.supabase.co`,
  VITE_SUPABASE_ANON_KEY: jwt('anon'),
  ARCLOOP_TEST_PROJECT_REF: REF,
  ARCLOOP_CONFIRM_TEST_PROJECT: 'yes',
})

describe('verification guards', () => {
  it('allows a named, confirmed hosted project with a public key', () => {
    expect(checkTarget(good())).toEqual({ ok: true, problems: [], ref: REF })
  })

  it('refuses when nothing is configured', () => {
    const result = checkTarget({})
    expect(result.ok).toBe(false)
    expect(result.problems.length).toBeGreaterThanOrEqual(4)
  })

  it('refuses placeholders from .env.example', () => {
    const env = { ...good(), VITE_SUPABASE_URL: 'https://your-project-ref.supabase.co', VITE_SUPABASE_ANON_KEY: 'your-public-anon-or-publishable-key' }
    const result = checkTarget(env)
    expect(result.ok).toBe(false)
    expect(result.problems.join(' ')).toMatch(/placeholder/)
  })

  it('refuses when the declared test ref does not match the URL, or is missing', () => {
    expect(checkTarget({ ...good(), ARCLOOP_TEST_PROJECT_REF: 'zzzzzzzzzzzzzzzzzzzz' }).problems.join(' ')).toMatch(/does not match/)
    const { ARCLOOP_TEST_PROJECT_REF, ...without } = good()
    expect(ARCLOOP_TEST_PROJECT_REF).toBe(REF)
    expect(checkTarget(without).ok).toBe(false)
  })

  it('refuses without the explicit confirmation', () => {
    expect(checkTarget({ ...good(), ARCLOOP_CONFIRM_TEST_PROJECT: 'true' }).ok).toBe(false)
    expect(checkTarget({ ...good(), ARCLOOP_CONFIRM_TEST_PROJECT: undefined }).ok).toBe(false)
  })

  it('refuses local, custom-domain and non-https targets', () => {
    for (const url of ['http://127.0.0.1:54321', 'http://localhost:54321', `https://${REF}.supabase.co.evil.example`, `http://${REF}.supabase.co`, 'https://api.mycompany.com', `https://${REF}.supabase.co/rest/v1`]) {
      expect(checkTarget({ ...good(), VITE_SUPABASE_URL: url }).ok, url).toBe(false)
    }
  })

  it('refuses a service-role or secret key in place of the public key', () => {
    expect(checkTarget({ ...good(), VITE_SUPABASE_ANON_KEY: jwt('service_role') }).problems.join(' ')).toMatch(/service-role/)
    expect(checkTarget({ ...good(), VITE_SUPABASE_ANON_KEY: 'sb_secret_abc123' }).problems.join(' ')).toMatch(/secret key/)
    expect(checkTarget({ ...good(), VITE_SUPABASE_ANON_KEY: 'sb_publishable_abc123' }).ok).toBe(true)
  })

  it('never echoes a key or token in its messages', () => {
    const secret = jwt('service_role')
    const result = checkTarget({ ...good(), VITE_SUPABASE_ANON_KEY: secret })
    expect(JSON.stringify(result)).not.toContain(secret)
  })
})

describe('preflight helpers', () => {
  it('reports only names and a status, never a value', () => {
    const key = jwt('anon')
    const report = describeEnv({ ...good(), VITE_SUPABASE_ANON_KEY: key, ARCLOOP_CONFIRM_TEST_PROJECT: undefined })
    expect(report).toEqual([
      { name: 'VITE_SUPABASE_URL', status: 'set' },
      { name: 'VITE_SUPABASE_ANON_KEY', status: 'set' },
      { name: 'ARCLOOP_TEST_PROJECT_REF', status: 'set' },
      { name: 'ARCLOOP_CONFIRM_TEST_PROJECT', status: 'missing' },
    ])
    expect(JSON.stringify(report)).not.toContain(key)
    expect(describeEnv({ VITE_SUPABASE_URL: 'https://your-project-ref.supabase.co' })[0].status).toBe('placeholder')
  })

  it('knows which Node versions support --env-file (20.6 or later)', () => {
    for (const v of ['v20.6.0', '20.10.1', 'v22.0.0', '24.21.0']) expect(nodeMeetsRequirement(v), v).toBe(true)
    for (const v of ['v18.19.0', '20.5.9', 'v16.0.0']) expect(nodeMeetsRequirement(v), v).toBe(false)
  })

  it('refuses a privileged value placed in a VITE_ variable, and names the variable without echoing its value', () => {
    const env = { ...good(), VITE_SUPABASE_SERVICE_ROLE_KEY: 'super-secret-value', VITE_DB_PASSWORD: 'another-secret' }
    expect(privilegedViteVariables(env).sort()).toEqual(['VITE_DB_PASSWORD', 'VITE_SUPABASE_SERVICE_ROLE_KEY'])
    const result = checkTarget(env)
    expect(result.ok).toBe(false)
    expect(result.problems.join(' ')).toMatch(/VITE_SUPABASE_SERVICE_ROLE_KEY looks like a privileged value/)
    expect(JSON.stringify(result)).not.toMatch(/super-secret-value|another-secret/)
    expect(checkTarget(good()).ok).toBe(true) // the normal variables are not mistaken for privileged ones
  })
})

describe('scripts/verify-supabase.mjs', () => {
  const run = (env, args = []) => spawnSync(process.execPath, ['scripts/verify-supabase.mjs', ...args], { cwd: process.cwd(), env: { PATH: process.env.PATH, ...env }, encoding: 'utf8', timeout: 20000 })

  it('refuses to run, exits non-zero, and contacts nothing when nothing is configured', () => {
    const { status, stderr } = run({})
    expect(status).toBe(2)
    expect(stderr).toMatch(/Refusing to run\. Nothing was contacted\./)
  })

  it('--preflight reports readiness, exits 0, and prints no key', () => {
    const key = jwt('anon')
    const { status, stdout, stderr } = run({ ...good(), VITE_SUPABASE_ANON_KEY: key, ARCLOOP_PREFLIGHT: '1' }, ['--preflight'])
    expect(status).toBe(0)
    expect(stdout).toMatch(/Preflight passed/)
    expect(stdout).toMatch(/VITE_SUPABASE_ANON_KEY: set/)
    expect(stdout + stderr).not.toContain(key)
    expect(stdout).not.toContain(REF) // only the first four characters of the ref are shown
  })

  it('--preflight says exactly what is missing or still a placeholder, exits non-zero, and contacts nothing', () => {
    const { status, stdout } = run({ VITE_SUPABASE_URL: 'https://your-project-ref.supabase.co' }, ['--preflight'])
    expect(status).toBe(2)
    expect(stdout).toMatch(/VITE_SUPABASE_URL: placeholder/)
    expect(stdout).toMatch(/VITE_SUPABASE_ANON_KEY: missing/)
    expect(stdout).toMatch(/Not ready:/)
  })

  it('refuses when the project is not named and confirmed, without printing the key', () => {
    const key = jwt('anon')
    const { status, stderr, stdout } = run({ VITE_SUPABASE_URL: `https://${REF}.supabase.co`, VITE_SUPABASE_ANON_KEY: key })
    expect(status).toBe(2)
    expect(stderr).toMatch(/ARCLOOP_TEST_PROJECT_REF is not set/)
    expect(stderr + stdout).not.toContain(key)
  })
})
