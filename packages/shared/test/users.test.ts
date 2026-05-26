import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { UserSchema, GuestJoinRequestSchema } from '../src/schemas/users'

describe('UserSchema', () => {
  function baseUser(extra: Record<string, unknown> = {}) {
    return {
      id: randomUUID(),
      role: 'player',
      displayName: 'Alex',
      email: 'alex@bar.com',
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      ...extra,
    }
  }

  it('accepts a valid user', () => {
    expect(UserSchema.parse(baseUser()).displayName).toBe('Alex')
  })

  it('accepts a null email (guest)', () => {
    expect(UserSchema.parse(baseUser({ email: null })).email).toBeNull()
  })

  it('rejects a non-datetime createdAt', () => {
    expect(UserSchema.safeParse(baseUser({ createdAt: 'yesterday' })).success).toBe(false)
  })

  it('rejects a displayName longer than 50 chars', () => {
    expect(UserSchema.safeParse(baseUser({ displayName: 'x'.repeat(51) })).success).toBe(false)
  })
})

describe('GuestJoinRequestSchema', () => {
  it('accepts a displayName and roomCode', () => {
    expect(GuestJoinRequestSchema.parse({ displayName: 'Sam', roomCode: 'WXYZ' })).toEqual({
      displayName: 'Sam',
      roomCode: 'WXYZ',
    })
  })

  it('rejects an empty displayName', () => {
    expect(GuestJoinRequestSchema.safeParse({ displayName: '', roomCode: 'WXYZ' }).success).toBe(false)
  })
})
