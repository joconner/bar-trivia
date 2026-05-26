import { describe, it, expect, vi } from 'vitest'
import { UnauthorizedException, ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtAuthGuard } from '../../src/auth/jwt-auth.guard'
import type { AuthService } from '../../src/auth/auth.service'

function makeContext(req: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext
}

function makeGuard(opts: { isPublic?: boolean; verify?: (t: string) => unknown }) {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(opts.isPublic ?? false),
  } as unknown as Reflector
  const auth = {
    verifyAccessToken: vi.fn((token: string) => {
      if (opts.verify) return opts.verify(token)
      return { sub: 'u1', role: 'host', displayName: 'H' }
    }),
  } as unknown as AuthService
  return { guard: new JwtAuthGuard(auth, reflector), auth }
}

describe('JwtAuthGuard', () => {
  it('skips auth for routes marked public', () => {
    const { guard, auth } = makeGuard({ isPublic: true })
    const req = {} as Record<string, unknown>
    expect(guard.canActivate(makeContext(req))).toBe(true)
    expect(auth.verifyAccessToken).not.toHaveBeenCalled()
  })

  it('throws when the authorization header is missing', () => {
    const { guard } = makeGuard({})
    expect(() => guard.canActivate(makeContext({ headers: {} }))).toThrow(UnauthorizedException)
  })

  it('throws when the header is not a Bearer token', () => {
    const { guard } = makeGuard({})
    const ctx = makeContext({ headers: { authorization: 'Basic abc' } })
    expect(() => guard.canActivate(ctx)).toThrow(/Missing authorization header/)
  })

  it('verifies a Bearer token and attaches the payload to the request', () => {
    const payload = { sub: 'u1', role: 'host', displayName: 'H' }
    const { guard, auth } = makeGuard({ verify: () => payload })
    const req: Record<string, unknown> = { headers: { authorization: 'Bearer good.token' } }

    expect(guard.canActivate(makeContext(req))).toBe(true)
    expect(auth.verifyAccessToken).toHaveBeenCalledWith('good.token')
    expect(req.user).toEqual(payload)
  })

  it('propagates the error when token verification fails', () => {
    const { guard } = makeGuard({
      verify: () => {
        throw new UnauthorizedException('Invalid or expired token')
      },
    })
    const ctx = makeContext({ headers: { authorization: 'Bearer bad' } })
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException)
  })
})
