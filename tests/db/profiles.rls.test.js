import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asUser, createDb, createUser } from './harness.js'

// Runs the real migration SQL in PGlite and checks the security rules from the
// perspective of different API roles.
let db
let alice
let bob

beforeAll(async () => {
  db = await createDb()
  alice = await createUser(db, 'alice@example.com')
  bob = await createUser(db, 'bob@example.com')
}, 60000)

afterAll(async () => {
  await db?.close()
})

const rejects = (promise, pattern) => expect(promise).rejects.toThrow(pattern)

describe('profile creation', () => {
  it('creates a private profile automatically when a user signs up', async () => {
    const { rows } = await db.query('select * from public.profiles where id = $1', [alice])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      display_name: null,
      timezone: 'UTC',
      profile_visibility: 'private',
      progress_visibility: 'private',
    })
    expect(rows[0].interests).toEqual([])
  })

  it('does not let clients insert profiles', async () => {
    await rejects(
      asUser(db, alice, (d) => d.query('insert into public.profiles (id) values (gen_random_uuid())')),
      /permission denied/i,
    )
  })

  it('cannot call the trigger functions directly', async () => {
    await rejects(asUser(db, alice, (d) => d.query('select public.handle_new_user()')), /permission denied/i)
  })
})

describe('reading profiles', () => {
  it('lets a user read their own profile', async () => {
    const { rows } = await asUser(db, alice, (d) => d.query('select id from public.profiles'))
    expect(rows.map((r) => r.id)).toEqual([alice])
  })

  it('never returns another user’s profile, even when asked by id', async () => {
    const { rows } = await asUser(db, alice, (d) => d.query('select * from public.profiles where id = $1', [bob]))
    expect(rows).toEqual([])
  })

  it('does not expose another user’s profile even if they chose "public"', async () => {
    await db.query(`update public.profiles set profile_visibility = 'public' where id = $1`, [bob])
    const { rows } = await asUser(db, alice, (d) => d.query('select * from public.profiles where id = $1', [bob]))
    expect(rows).toEqual([])
    await db.query(`update public.profiles set profile_visibility = 'private' where id = $1`, [bob])
  })

  it('denies anonymous access entirely', async () => {
    await rejects(asUser(db, null, (d) => d.query('select * from public.profiles')), /permission denied/i)
  })
})

describe('updating profiles', () => {
  it('lets a user update their own editable fields', async () => {
    const { affectedRows } = await asUser(db, alice, (d) =>
      d.query(
        `update public.profiles set display_name = 'Alice', timezone = 'Asia/Kolkata', interests = '{reading,running}', profile_visibility = 'public' where id = $1`,
        [alice],
      ),
    )
    expect(affectedRows).toBe(1)
    const { rows } = await db.query('select * from public.profiles where id = $1', [alice])
    expect(rows[0]).toMatchObject({ display_name: 'Alice', timezone: 'Asia/Kolkata', profile_visibility: 'public' })
  })

  it('refreshes updated_at on update', async () => {
    const before = (await db.query('select updated_at from public.profiles where id = $1', [alice])).rows[0].updated_at
    await new Promise((r) => setTimeout(r, 20))
    await asUser(db, alice, (d) => d.query(`update public.profiles set display_name = 'Alice B' where id = $1`, [alice]))
    const after = (await db.query('select updated_at from public.profiles where id = $1', [alice])).rows[0].updated_at
    expect(after.getTime()).toBeGreaterThan(before.getTime())
  })

  it('updates zero rows when targeting another user’s profile', async () => {
    const { affectedRows } = await asUser(db, alice, (d) =>
      d.query(`update public.profiles set display_name = 'Hacked' where id = $1`, [bob]),
    )
    expect(affectedRows).toBe(0)
    const { rows } = await db.query('select display_name from public.profiles where id = $1', [bob])
    expect(rows[0].display_name).toBeNull()
  })

  it('cannot reassign a profile to another user id', async () => {
    await rejects(
      asUser(db, alice, (d) => d.query('update public.profiles set id = $1 where id = $2', [bob, alice])),
      /permission denied/i,
    )
  })

  it('cannot forge created_at or updated_at', async () => {
    await rejects(
      asUser(db, alice, (d) => d.query(`update public.profiles set created_at = '2000-01-01' where id = $1`, [alice])),
      /permission denied/i,
    )
    await rejects(
      asUser(db, alice, (d) => d.query(`update public.profiles set updated_at = '2000-01-01' where id = $1`, [alice])),
      /permission denied/i,
    )
  })

  it('denies anonymous updates', async () => {
    await rejects(asUser(db, null, (d) => d.query(`update public.profiles set display_name = 'x'`)), /permission denied/i)
  })
})

describe('validation constraints', () => {
  const update = (set) => asUser(db, alice, (d) => d.query(`update public.profiles set ${set} where id = '${alice}'`))

  it('rejects an invalid timezone', async () => {
    await rejects(update(`timezone = 'Mars/Olympus'`), /Invalid timezone/)
  })
  it('rejects an empty or over-long display name', async () => {
    await rejects(update(`display_name = '   '`), /profiles_display_name_length/)
    await rejects(update(`display_name = '${'x'.repeat(61)}'`), /profiles_display_name_length/)
  })
  it('rejects unknown visibility values', async () => {
    await rejects(update(`profile_visibility = 'everyone'`), /profiles_profile_visibility_valid/)
    await rejects(update(`progress_visibility = 'friends'`), /profiles_progress_visibility_valid/)
  })
  it('limits the number and size of interests', async () => {
    const many = Array.from({ length: 11 }, (_, i) => `i${i}`).join(',')
    await rejects(update(`interests = '{${many}}'`), /profiles_interests_size/)
    await rejects(update(`interests = '{${'y'.repeat(401)}}'`), /profiles_interests_size/)
  })
})

describe('deletion', () => {
  it('does not let clients delete profiles', async () => {
    await rejects(asUser(db, alice, (d) => d.query('delete from public.profiles')), /permission denied/i)
  })

  it('removes the profile when the auth user is deleted', async () => {
    const carol = await createUser(db, 'carol@example.com')
    expect((await db.query('select 1 from public.profiles where id = $1', [carol])).rows).toHaveLength(1)
    await db.query('delete from auth.users where id = $1', [carol])
    expect((await db.query('select 1 from public.profiles where id = $1', [carol])).rows).toHaveLength(0)
  })
})
