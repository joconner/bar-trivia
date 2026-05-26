import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ConflictException, UnauthorizedException } from '@nestjs/common'
import { AuthService } from '../../src/auth/auth.service'
import type { UsersService } from '../../src/users/users.service'
import { makePrismaMock, type PrismaMock } from './test-utils'

// argon2 is a slow native module; stub it with a deterministic, fast double.
vi.mock('@node-rs/argon2', () => ({
  hash: vi.fn(async (pw: string) => `hashed:${pw}`),
  verify: vi.fn(async (stored: string, pw: string) => stored === `hashed:${pw}`),
}))

const FUTURE = () => new Date(Date.now() + 7 * 24 * 3600 * 1000)
const PAST = () => new Date(Date.now() - 1000)

let prisma: PrismaMock
let service: AuthService

function build() {
  prisma = makePrismaMock()
  service = new AuthService(prisma as never, {} as unknown as UsersService)
}

beforeEach(() => {
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret'
  build()
})

describe('AuthService.register', () => {
  it('rejects an already-registered email', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1' })
    await expect(service.register({ email: 'a@b.com', password: 'password1', displayName: 'H' })).rejects.toBeInstanceOf(
      ConflictException,
    )
  })

  it('hashes the password, creates a host, and returns a verifiable token pair', async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    prisma.user.create.mockResolvedValue({ id: 'u1', displayName: 'H', role: 'host' })
    prisma.refreshToken.create.mockResolvedValue({ id: 'rt1' })

    const result = await service.register({ email: 'a@b.com', password: 'password1', displayName: 'H' })

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'host', passwordHash: 'hashed:password1' }) }),
    )
    expect(prisma.refreshToken.create).toHaveBeenCalledOnce()
    const payload = service.verifyAccessToken(result.accessToken)
    expect(payload.sub).toBe('u1')
    expect(payload.role).toBe('host')
    expect(typeof result.refreshToken).toBe('string')
  })
})

describe('AuthService.login', () => {
  it('rejects an unknown email', async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    await expect(service.login({ email: 'x@y.com', password: 'password1' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
  })

  it('rejects a user with no password hash (e.g. OAuth-only or seeded)', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: null })
    await expect(service.login({ email: 'x@y.com', password: 'password1' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
  })

  it('rejects a wrong password', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: 'hashed:correct', role: 'host', displayName: 'H' })
    await expect(service.login({ email: 'x@y.com', password: 'wrong' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
  })

  it('logs in, touches lastSeenAt, and returns tokens carrying the user role', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: 'hashed:correct', role: 'player', displayName: 'P' })
    prisma.refreshToken.create.mockResolvedValue({ id: 'rt1' })

    const result = await service.login({ email: 'x@y.com', password: 'correct' })

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' }, data: expect.objectContaining({ lastSeenAt: expect.any(Date) }) }),
    )
    expect(service.verifyAccessToken(result.accessToken).role).toBe('player')
  })
})

describe('AuthService.refresh', () => {
  it('rejects an unknown refresh token', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(null)
    await expect(service.refresh('raw')).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('detects reuse of an already-rotated token, revokes it, and rejects', async () => {
    prisma.refreshToken.findUnique.mockResolvedValueOnce({ id: 'rt1', rotatedToId: 'rt2', revokedAt: null, expiresAt: FUTURE(), userId: 'u1' })
    prisma.refreshToken.findUnique.mockResolvedValue({ id: 'rt1', rotatedToId: null })

    await expect(service.refresh('raw')).rejects.toThrow(/already used/)
    expect(prisma.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ revokedAt: expect.any(Date) }) }),
    )
  })

  it('rejects a revoked token', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({ id: 'rt1', rotatedToId: null, revokedAt: PAST(), expiresAt: FUTURE(), userId: 'u1' })
    await expect(service.refresh('raw')).rejects.toThrow(/expired or revoked/)
  })

  it('rejects an expired token', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({ id: 'rt1', rotatedToId: null, revokedAt: null, expiresAt: PAST(), userId: 'u1' })
    await expect(service.refresh('raw')).rejects.toThrow(/expired or revoked/)
  })

  it('treats a token rotated within the grace window as a concurrent refresh, not theft', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({ id: 'rt1', rotatedToId: 'rt2', revokedAt: null, expiresAt: FUTURE(), userId: 'u1', lastUsedAt: new Date() })

    await expect(service.refresh('raw')).rejects.toThrow(/already in progress/)
    // A benign race must NOT revoke the chain (revokeChain rotates via update).
    expect(prisma.refreshToken.update).not.toHaveBeenCalled()
  })

  it('rotates a valid token atomically, linking the old row to the new one', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({ id: 'rt1', rotatedToId: null, revokedAt: null, expiresAt: FUTURE(), userId: 'u1' })
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'u1', role: 'host', displayName: 'H', participants: [] })
    prisma.refreshToken.create.mockResolvedValue({ id: 'rt-new' })
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 })

    const result = await service.refresh('raw')

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rt1', rotatedToId: null },
        data: expect.objectContaining({ rotatedToId: 'rt-new' }),
      }),
    )
    expect(service.verifyAccessToken(result.accessToken).sub).toBe('u1')
  })

  it('discards its freshly-minted token and bows out when it loses the rotation race', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({ id: 'rt1', rotatedToId: null, revokedAt: null, expiresAt: FUTURE(), userId: 'u1' })
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'u1', role: 'host', displayName: 'H', participants: [] })
    prisma.refreshToken.create.mockResolvedValue({ id: 'rt-new' })
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 })
    prisma.refreshToken.delete.mockResolvedValue({})

    await expect(service.refresh('raw')).rejects.toThrow(/already in progress/)
    expect(prisma.refreshToken.delete).toHaveBeenCalledWith({ where: { id: 'rt-new' } })
  })

  it('re-embeds a guest latest active room participant into the new access token', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({ id: 'rt1', rotatedToId: null, revokedAt: null, expiresAt: FUTURE(), userId: 'g1' })
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'g1',
      role: 'guest',
      displayName: 'BraveOtter',
      participants: [{ id: 'p1', roomCode: 'WXYZ' }],
    })
    prisma.refreshToken.create.mockResolvedValue({ id: 'rt-new' })
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 })

    const result = await service.refresh('raw')
    const payload = service.verifyAccessToken(result.accessToken)
    expect(payload.role).toBe('guest')
    expect(payload.roomCode).toBe('WXYZ')
    expect(payload.roomParticipantId).toBe('p1')
  })
})

describe('AuthService.logout', () => {
  it('is a no-op when the token is unknown', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(null)
    await service.logout('raw')
    expect(prisma.refreshToken.update).not.toHaveBeenCalled()
  })

  it('revokes a known token', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({ id: 'rt1' })
    await service.logout('raw')
    expect(prisma.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'rt1' }, data: expect.objectContaining({ revokedAt: expect.any(Date) }) }),
    )
  })
})

describe('AuthService access tokens', () => {
  it('round-trips a room access token with room claims', () => {
    const token = service.issueRoomAccessToken('u1', 'BraveOtter', 'WXYZ', 'p1')
    const payload = service.verifyAccessToken(token)
    expect(payload).toMatchObject({ sub: 'u1', role: 'guest', roomCode: 'WXYZ', roomParticipantId: 'p1' })
  })

  it('issueRoomTokenPair persists a refresh token and returns both tokens', async () => {
    prisma.refreshToken.create.mockResolvedValue({ id: 'rt1' })
    const pair = await service.issueRoomTokenPair('u1', 'BraveOtter', 'WXYZ', 'p1')
    expect(prisma.refreshToken.create).toHaveBeenCalledOnce()
    expect(typeof pair.accessToken).toBe('string')
    expect(typeof pair.refreshToken).toBe('string')
  })

  it('rejects a malformed token', () => {
    expect(() => service.verifyAccessToken('garbage')).toThrow(UnauthorizedException)
  })

  it('throws when JWT_SECRET is not configured', () => {
    delete process.env.JWT_SECRET
    expect(() => service.issueRoomAccessToken('u1', 'N', 'WXYZ', 'p1')).toThrow(/JWT_SECRET not set/)
  })
})
