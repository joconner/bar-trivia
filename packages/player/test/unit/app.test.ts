import { describe, it, expect } from 'vitest'
import { getRoomCodeFromPath } from '../../src/App'

describe('getRoomCodeFromPath', () => {
  it('extracts the room code when served under the /player/ base (prod QR scan)', () => {
    expect(getRoomCodeFromPath('/player/join/MURP', '/player/')).toBe('MURP')
  })

  it('extracts the room code at root base (vite dev)', () => {
    expect(getRoomCodeFromPath('/join/MURP', '/')).toBe('MURP')
  })

  it('uppercases lowercase codes', () => {
    expect(getRoomCodeFromPath('/player/join/murp', '/player/')).toBe('MURP')
  })

  it('tolerates a trailing slash', () => {
    expect(getRoomCodeFromPath('/player/join/MURP/', '/player/')).toBe('MURP')
  })

  it('returns undefined for non-join paths', () => {
    expect(getRoomCodeFromPath('/player/', '/player/')).toBeUndefined()
    expect(getRoomCodeFromPath('/player/lobby', '/player/')).toBeUndefined()
  })

  it('returns undefined for malformed codes', () => {
    expect(getRoomCodeFromPath('/player/join/ROOM-1', '/player/')).toBeUndefined()
    expect(getRoomCodeFromPath('/player/join/', '/player/')).toBeUndefined()
  })
})
