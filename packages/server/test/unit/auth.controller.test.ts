import { describe, it, expect, beforeEach, vi } from 'vitest'
import { UnauthorizedException } from '@nestjs/common'
import { AuthController } from '../../src/auth/auth.controller'
import type { AuthService } from '../../src/auth/auth.service'

// Minimal Express Response double that captures cookie operations.
function makeRes() {
  const cookies: Record<string, { value: string; options: object }> = {}
  const cleared: string[] = []
  return {
    cookie: vi.fn((name: string, value: string, opts: object) => {
      cookies[name] = { value, options: opts }
    }),
    clearCookie: vi.fn((name: string) => {
      cleared.push(name)
    }),
    _cookies: cookies,
    _cleared: cleared,
  }
}

function makeReq(cookieValue?: string) {
  return {
    cookies: cookieValue !== undefined ? { refresh_token: cookieValue } : {},
  }
}

let auth: {
  register: ReturnType<typeof vi.fn>
  login: ReturnType<typeof vi.fn>
  refresh: ReturnType<typeof vi.fn>
  logout: ReturnType<typeof vi.fn>
}
let controller: AuthController

beforeEach(() => {
  auth = {
    register: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
  }
  controller = new AuthController(auth as unknown as AuthService)
})

describe('POST /auth/register', () => {
  it('returns the access token and sets the refresh cookie', async () => {
    auth.register.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' })
    const res = makeRes()

    const result = await controller.register({ email: 'a@b.com', password: 'pw', displayName: 'Alice' } as never, res as never)

    expect(result).toEqual({ accessToken: 'at' })
    expect(res.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'rt',
      expect.objectContaining({ httpOnly: true, path: '/auth/refresh' }),
    )
  })

  it('delegates the body to auth.register without modification', async () => {
    auth.register.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' })
    const body = { email: 'host@bar.com', password: 'secret', displayName: 'Host' }

    await controller.register(body as never, makeRes() as never)

    expect(auth.register).toHaveBeenCalledWith(body)
  })
})

describe('POST /auth/login', () => {
  it('returns the access token and sets the refresh cookie', async () => {
    auth.login.mockResolvedValue({ accessToken: 'at2', refreshToken: 'rt2' })
    const res = makeRes()

    const result = await controller.login({ email: 'a@b.com', password: 'pw' } as never, res as never)

    expect(result).toEqual({ accessToken: 'at2' })
    expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'rt2', expect.anything())
  })
})

describe('POST /auth/refresh', () => {
  it('throws UnauthorizedException when no refresh cookie is present', async () => {
    const req = makeReq()

    await expect(controller.refresh(req as never, makeRes() as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
    expect(auth.refresh).not.toHaveBeenCalled()
  })

  it('rotates the cookie and returns a new access token', async () => {
    auth.refresh.mockResolvedValue({ accessToken: 'new-at', refreshToken: 'new-rt' })
    const res = makeRes()

    const result = await controller.refresh(makeReq('old-rt') as never, res as never)

    expect(auth.refresh).toHaveBeenCalledWith('old-rt')
    expect(result).toEqual({ accessToken: 'new-at' })
    expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'new-rt', expect.anything())
  })

  it('propagates service errors (expired token)', async () => {
    auth.refresh.mockRejectedValue(new UnauthorizedException('Invalid refresh token'))
    await expect(
      controller.refresh(makeReq('expired') as never, makeRes() as never),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })
})

describe('POST /auth/logout', () => {
  it('calls auth.logout with the cookie value and clears the cookie', async () => {
    auth.logout.mockResolvedValue(undefined)
    const res = makeRes()

    await controller.logout(makeReq('my-rt') as never, res as never)

    expect(auth.logout).toHaveBeenCalledWith('my-rt')
    expect(res.clearCookie).toHaveBeenCalledWith('refresh_token', expect.objectContaining({ path: '/auth/refresh' }))
  })

  it('clears the cookie even when no refresh cookie was present', async () => {
    const res = makeRes()

    await controller.logout(makeReq() as never, res as never)

    expect(auth.logout).not.toHaveBeenCalled()
    expect(res.clearCookie).toHaveBeenCalled()
  })
})
