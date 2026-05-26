import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  UserRoleSchema,
  AccessTokenPayloadSchema,
  LoginRequestSchema,
  RegisterHostRequestSchema,
  RefreshRequestSchema,
  TokenResponseSchema,
} from '../src/schemas/auth'

describe('UserRoleSchema', () => {
  it('accepts the four known roles', () => {
    for (const role of ['guest', 'player', 'host', 'admin']) {
      expect(UserRoleSchema.parse(role)).toBe(role)
    }
  })

  it('rejects an unknown role', () => {
    expect(UserRoleSchema.safeParse('superadmin').success).toBe(false)
  })
})

describe('AccessTokenPayloadSchema', () => {
  it('accepts a minimal payload without room fields', () => {
    const payload = { sub: randomUUID(), role: 'host', displayName: 'Host' }
    expect(AccessTokenPayloadSchema.parse(payload).roomCode).toBeUndefined()
  })

  it('accepts optional roomCode and roomParticipantId', () => {
    const payload = {
      sub: randomUUID(),
      role: 'guest',
      displayName: 'BraveOtter',
      roomCode: 'WXYZ',
      roomParticipantId: randomUUID(),
    }
    expect(AccessTokenPayloadSchema.parse(payload).roomParticipantId).toBeTruthy()
  })

  it('rejects a non-uuid sub', () => {
    expect(
      AccessTokenPayloadSchema.safeParse({ sub: 'abc', role: 'guest', displayName: 'x' }).success,
    ).toBe(false)
  })

  it('rejects a non-uuid roomParticipantId', () => {
    expect(
      AccessTokenPayloadSchema.safeParse({
        sub: randomUUID(),
        role: 'guest',
        displayName: 'x',
        roomParticipantId: 'nope',
      }).success,
    ).toBe(false)
  })
})

describe('LoginRequestSchema', () => {
  it('accepts a valid email and 8-128 char password', () => {
    expect(LoginRequestSchema.parse({ email: 'a@b.com', password: 'password1' })).toBeTruthy()
  })

  it('rejects an invalid email', () => {
    expect(LoginRequestSchema.safeParse({ email: 'nope', password: 'password1' }).success).toBe(false)
  })

  it('rejects a password shorter than 8 chars', () => {
    expect(LoginRequestSchema.safeParse({ email: 'a@b.com', password: 'short' }).success).toBe(false)
  })

  it('rejects a password longer than 128 chars', () => {
    expect(
      LoginRequestSchema.safeParse({ email: 'a@b.com', password: 'x'.repeat(129) }).success,
    ).toBe(false)
  })
})

describe('RegisterHostRequestSchema', () => {
  it('accepts email, password and a 1-50 char displayName', () => {
    expect(
      RegisterHostRequestSchema.parse({
        email: 'h@bar.com',
        password: 'password1',
        displayName: 'Quizmaster',
      }),
    ).toBeTruthy()
  })

  it('rejects an empty displayName', () => {
    expect(
      RegisterHostRequestSchema.safeParse({
        email: 'h@bar.com',
        password: 'password1',
        displayName: '',
      }).success,
    ).toBe(false)
  })

  it('rejects a displayName longer than 50 chars', () => {
    expect(
      RegisterHostRequestSchema.safeParse({
        email: 'h@bar.com',
        password: 'password1',
        displayName: 'x'.repeat(51),
      }).success,
    ).toBe(false)
  })
})

describe('RefreshRequestSchema and TokenResponseSchema', () => {
  it('RefreshRequestSchema requires a refreshToken string', () => {
    expect(RefreshRequestSchema.parse({ refreshToken: 'abc' }).refreshToken).toBe('abc')
    expect(RefreshRequestSchema.safeParse({}).success).toBe(false)
  })

  it('TokenResponseSchema requires both tokens', () => {
    expect(
      TokenResponseSchema.parse({ accessToken: 'a', refreshToken: 'r' }),
    ).toEqual({ accessToken: 'a', refreshToken: 'r' })
    expect(TokenResponseSchema.safeParse({ accessToken: 'a' }).success).toBe(false)
  })
})
