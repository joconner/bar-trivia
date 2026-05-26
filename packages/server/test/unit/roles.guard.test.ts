import { describe, it, expect, vi } from 'vitest'
import { ForbiddenException, ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { RolesGuard } from '../../src/auth/roles.guard'

function makeContext(user: unknown): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext
}

function makeGuard(required: string[] | undefined) {
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(required) } as unknown as Reflector
  return new RolesGuard(reflector)
}

describe('RolesGuard', () => {
  it('allows the request when no roles are required', () => {
    expect(makeGuard(undefined).canActivate(makeContext(undefined))).toBe(true)
    expect(makeGuard([]).canActivate(makeContext(undefined))).toBe(true)
  })

  it('throws when a role is required but no user is attached', () => {
    expect(() => makeGuard(['host']).canActivate(makeContext(undefined))).toThrow(ForbiddenException)
  })

  it('throws when the user role is not in the required set', () => {
    const ctx = makeContext({ role: 'guest' })
    expect(() => makeGuard(['host', 'admin']).canActivate(ctx)).toThrow(/Requires one of roles/)
  })

  it('allows the request when the user role is in the required set', () => {
    const ctx = makeContext({ role: 'host' })
    expect(makeGuard(['host', 'admin']).canActivate(ctx)).toBe(true)
  })
})
