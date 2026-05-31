import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  getAccessToken,
  setAccessToken,
  refreshAccessToken,
  subscribe,
} from '../../src/token-store'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response
}

beforeEach(() => {
  vi.useFakeTimers()
  setAccessToken(null) // reset module state: clears token and proactive timer
  mockFetch.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('setAccessToken / getAccessToken', () => {
  it('stores a token and retrieves it', () => {
    setAccessToken('tok-abc')
    expect(getAccessToken()).toBe('tok-abc')
  })

  it('clears the token when set to null', () => {
    setAccessToken('tok-abc')
    setAccessToken(null)
    expect(getAccessToken()).toBeNull()
  })

  it('notifies subscribers when the token changes', () => {
    const listener = vi.fn()
    const unsub = subscribe(listener)
    setAccessToken('tok-xyz')
    expect(listener).toHaveBeenCalledWith('tok-xyz')
    unsub()
  })

  it('does not notify a removed subscriber', () => {
    const listener = vi.fn()
    const unsub = subscribe(listener)
    unsub()
    setAccessToken('tok-after-unsub')
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('expiry detection via token state', () => {
  it('proactive timer fires for a token with a future exp', () => {
    const futureSecs = Math.floor(Date.now() / 1000) + 3600
    const payload = Buffer.from(JSON.stringify({ exp: futureSecs })).toString('base64url')
    setAccessToken(`header.${payload}.sig`)

    mockFetch.mockResolvedValue(makeResponse({ accessToken: 'proactive-tok' }))
    // Advance to just after the 90-second proactive window
    vi.advanceTimersByTime((3600 - 90 + 1) * 1000)

    expect(mockFetch).toHaveBeenCalledWith('/auth/refresh', expect.objectContaining({ method: 'POST' }))
  })

  it('no proactive timer is scheduled for a token without an exp', () => {
    const payload = Buffer.from(JSON.stringify({ sub: 'u1' })).toString('base64url')
    setAccessToken(`header.${payload}.sig`)

    vi.advanceTimersByTime(24 * 60 * 60 * 1000) // 24 hours
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('refreshAccessToken — single-flight dedup', () => {
  it('returns the same in-flight promise for concurrent callers', async () => {
    mockFetch.mockResolvedValue(makeResponse({ accessToken: 'fresh-tok' }))
    const p1 = refreshAccessToken()
    const p2 = refreshAccessToken()
    const p3 = refreshAccessToken()
    expect(p1).toBe(p2)
    expect(p2).toBe(p3)
    await p1
  })

  it('calls fetch only once regardless of concurrent caller count', async () => {
    mockFetch.mockResolvedValue(makeResponse({ accessToken: 'fresh-tok' }))
    await Promise.all([refreshAccessToken(), refreshAccessToken(), refreshAccessToken()])
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('all concurrent callers receive the refreshed token', async () => {
    mockFetch.mockResolvedValue(makeResponse({ accessToken: 'fresh-tok' }))
    const results = await Promise.all([refreshAccessToken(), refreshAccessToken()])
    expect(results[0]).toBe('fresh-tok')
    expect(results[1]).toBe('fresh-tok')
  })

  it('updates the stored token after a successful refresh', async () => {
    mockFetch.mockResolvedValue(makeResponse({ accessToken: 'fresh-tok' }))
    await refreshAccessToken()
    expect(getAccessToken()).toBe('fresh-tok')
  })

  it('returns null and leaves token unchanged when refresh endpoint fails', async () => {
    setAccessToken('old-tok')
    mockFetch.mockResolvedValue(makeResponse({}, 401))
    const result = await refreshAccessToken()
    expect(result).toBeNull()
    expect(getAccessToken()).toBe('old-tok')
  })

  it('returns null when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('network error'))
    const result = await refreshAccessToken()
    expect(result).toBeNull()
  })

  it('allows a new refresh after the previous one completes', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse({ accessToken: 'tok-1' }))
      .mockResolvedValueOnce(makeResponse({ accessToken: 'tok-2' }))
    await refreshAccessToken()
    const result = await refreshAccessToken()
    expect(result).toBe('tok-2')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})
