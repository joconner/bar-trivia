import { describe, it, expect } from 'vitest'
import { decodeToken, isTokenExpired } from '../../src/jwt'

function makeToken(payload: Record<string, unknown>): string {
  const encode = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
  return `${encode({ alg: 'HS256' })}.${encode(payload)}.fakesig`
}

describe('decodeToken', () => {
  it('returns the parsed payload for a valid token', () => {
    const token = makeToken({ sub: 'p1', role: 'guest' })
    expect(decodeToken(token)).toMatchObject({ sub: 'p1', role: 'guest' })
  })

  it('returns null when the token has no dot separator', () => {
    expect(decodeToken('nodots')).toBeNull()
  })

  it('returns null when the payload segment is not valid base64', () => {
    expect(decodeToken('header.!!!invalid!!!.sig')).toBeNull()
  })

  it('returns null when the payload is not valid JSON', () => {
    const badPayload = Buffer.from('not-json').toString('base64')
    expect(decodeToken(`header.${badPayload}.sig`)).toBeNull()
  })
})

describe('isTokenExpired', () => {
  it('returns false for a token with a future exp', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600
    expect(isTokenExpired(makeToken({ exp }))).toBe(false)
  })

  it('returns true for a token with a past exp', () => {
    const exp = Math.floor(Date.now() / 1000) - 60
    expect(isTokenExpired(makeToken({ exp }))).toBe(true)
  })

  it('returns true when the exp field is missing from the payload', () => {
    expect(isTokenExpired(makeToken({ sub: 'p1' }))).toBe(true)
  })

  it('returns true when exp is not a number', () => {
    expect(isTokenExpired(makeToken({ exp: 'soon' }))).toBe(true)
  })

  it('returns true for a completely malformed token string', () => {
    expect(isTokenExpired('garbage')).toBe(true)
  })
})
