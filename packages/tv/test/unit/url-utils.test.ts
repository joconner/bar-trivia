import { describe, it, expect } from 'vitest'
import { getRoomCodeFromUrl, isNonRoutable } from '../../src/url-utils'

describe('getRoomCodeFromUrl', () => {
  describe('query param ?roomCode=', () => {
    it('returns the code from the query param', () => {
      expect(getRoomCodeFromUrl('http://bar.example.com/?roomCode=MURP')).toBe('MURP')
    })

    it('uppercases the query param value', () => {
      expect(getRoomCodeFromUrl('http://bar.example.com/?roomCode=murp')).toBe('MURP')
    })

    it('query param takes priority over path segment', () => {
      expect(getRoomCodeFromUrl('http://bar.example.com/ABCD?roomCode=WXYZ')).toBe('WXYZ')
    })
  })

  describe('path-based room code', () => {
    it('extracts a bare code from /<CODE>', () => {
      expect(getRoomCodeFromUrl('http://bar.example.com/MURP')).toBe('MURP')
    })

    it('extracts code from /tv/<CODE>', () => {
      expect(getRoomCodeFromUrl('http://bar.example.com/tv/MURP')).toBe('MURP')
    })

    it('skips the "tv" segment', () => {
      expect(getRoomCodeFromUrl('http://bar.example.com/tv')).toBeNull()
    })

    it('accepts alphanumeric codes that include digits', () => {
      expect(getRoomCodeFromUrl('http://bar.example.com/AB34')).toBe('AB34')
    })

    it('rejects single-character segments', () => {
      expect(getRoomCodeFromUrl('http://bar.example.com/A')).toBeNull()
    })

    it('rejects segments longer than 8 characters', () => {
      expect(getRoomCodeFromUrl('http://bar.example.com/ABCDEFGHI')).toBeNull()
    })

    it('returns null when no valid segment is found', () => {
      expect(getRoomCodeFromUrl('http://bar.example.com/')).toBeNull()
    })

    it('uses the last valid segment when multiple segments present', () => {
      expect(getRoomCodeFromUrl('http://bar.example.com/some/path/MURP')).toBe('MURP')
    })
  })
})

describe('isNonRoutable', () => {
  it('flags localhost', () => {
    expect(isNonRoutable('localhost')).toBe(true)
  })

  it('flags 127.0.0.1', () => {
    expect(isNonRoutable('127.0.0.1')).toBe(true)
  })

  it('flags ::1', () => {
    expect(isNonRoutable('::1')).toBe(true)
  })

  it('flags 0.0.0.0', () => {
    expect(isNonRoutable('0.0.0.0')).toBe(true)
  })

  it('flags empty string (no hostname)', () => {
    expect(isNonRoutable('')).toBe(true)
  })

  it('flags *.localhost subdomains', () => {
    expect(isNonRoutable('myapp.localhost')).toBe(true)
    expect(isNonRoutable('bar.trivia.localhost')).toBe(true)
  })

  it('allows a real LAN IP', () => {
    expect(isNonRoutable('192.168.1.50')).toBe(false)
  })

  it('allows a production hostname', () => {
    expect(isNonRoutable('bar.example.com')).toBe(false)
  })
})
