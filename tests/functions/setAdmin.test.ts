import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { callAs, createUser, errorCodeOf } from './helpers'

function setAdmin(...args: string[]) {
  const run = spawnSync('node', ['scripts/set-admin.mjs', ...args], {
    env: { ...process.env, FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', GCLOUD_PROJECT: 'ettunley-61749' },
    encoding: 'utf8',
  })
  return { code: run.status, out: run.stdout + run.stderr }
}

describe('scripts/set-admin.mjs', () => {
  it('makes a verified Google account an admin, and can take it away again', async () => {
    const owner = await createUser({ provider: 'google' })
    expect(await errorCodeOf(callAs(owner, 'listTeachers'))).toBe('functions/permission-denied')

    const granted = setAdmin(owner.email)
    expect(granted.code, granted.out).toBe(0)
    // A fresh sign-in carries the claim.
    expect(await errorCodeOf(callAs(owner, 'listTeachers'))).toBe('no-error')

    const removed = setAdmin(owner.email, '--remove')
    expect(removed.code, removed.out).toBe(0)
    expect(await errorCodeOf(callAs(owner, 'listTeachers'))).toBe('functions/permission-denied')
  })

  it('refuses an unverified e-mail, a non-Google account and an unknown e-mail', async () => {
    const unverified = await createUser({ provider: 'google', verified: false })
    const password = await createUser({ provider: 'password' })
    expect(setAdmin(unverified.email).code).toBe(1)
    expect(setAdmin(password.email).code).toBe(1)
    expect(setAdmin('nobody-at-all@example.com').code).toBe(1)
    expect(setAdmin().code).toBe(1)
  })
})
