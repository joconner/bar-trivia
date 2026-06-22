import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getToken, setToken, refreshAccessToken, listPacks, login, listMyRooms } from '../../src/api'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  } as unknown as Response
}

beforeEach(() => {
  vi.useFakeTimers()
  setToken(null)
  mockFetch.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('setToken / getToken', () => {
  it('stores and retrieves a token', () => {
    setToken('tok-host')
    expect(getToken()).toBe('tok-host')
  })

  it('clears the token when set to null', () => {
    setToken('tok-host')
    setToken(null)
    expect(getToken()).toBeNull()
  })
})

describe('refreshAccessToken — single-flight dedup', () => {
  it('returns the same in-flight promise for concurrent callers', async () => {
    mockFetch.mockResolvedValue(makeResponse({ accessToken: 'new-tok' }))
    const p1 = refreshAccessToken()
    const p2 = refreshAccessToken()
    const p3 = refreshAccessToken()
    expect(p1).toBe(p2)
    expect(p2).toBe(p3)
    await p1
  })

  it('calls fetch only once regardless of concurrent caller count', async () => {
    mockFetch.mockResolvedValue(makeResponse({ accessToken: 'new-tok' }))
    await Promise.all([refreshAccessToken(), refreshAccessToken(), refreshAccessToken()])
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('updates the stored token after a successful refresh', async () => {
    mockFetch.mockResolvedValue(makeResponse({ accessToken: 'new-tok' }))
    const result = await refreshAccessToken()
    expect(result).toBe('new-tok')
    expect(getToken()).toBe('new-tok')
  })

  it('returns null when the refresh endpoint returns non-ok', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 401))
    const result = await refreshAccessToken()
    expect(result).toBeNull()
  })

  it('returns null when fetch rejects', async () => {
    mockFetch.mockRejectedValue(new Error('offline'))
    const result = await refreshAccessToken()
    expect(result).toBeNull()
  })
})

describe('req — 401 retry on regular endpoints', () => {
  it('retries once after a 401 with the refreshed token', async () => {
    setToken('old-tok')
    mockFetch
      .mockResolvedValueOnce(makeResponse({}, 401))                  // original request → 401
      .mockResolvedValueOnce(makeResponse({ accessToken: 'new-tok' })) // refresh call
      .mockResolvedValueOnce(makeResponse([]))                        // retried request → ok

    const result = await listPacks()

    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(result).toEqual([])
  })

  it('attaches the refreshed token as Authorization on retry', async () => {
    setToken('old-tok')
    mockFetch
      .mockResolvedValueOnce(makeResponse({}, 401))
      .mockResolvedValueOnce(makeResponse({ accessToken: 'new-tok' }))
      .mockResolvedValueOnce(makeResponse([]))

    await listPacks()

    const [retryUrl, retryInit] = mockFetch.mock.calls[2]
    expect(retryUrl).toContain('/packs')
    expect((retryInit as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer new-tok',
    })
  })

  it('does not retry a second time if the retry also fails', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse({}, 401))
      .mockResolvedValueOnce(makeResponse({ accessToken: 'new-tok' }))
      .mockResolvedValueOnce(makeResponse({ message: 'still unauthorized' }, 401))

    await expect(listPacks()).rejects.toThrow()
    // original + refresh + retry = 3 calls, no fourth call
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })
})

describe('listMyRooms', () => {
  it('resolves with the room list on a happy-path GET /rooms/my-rooms', async () => {
    const rooms = [
      { roomCode: 'ABCD', packId: 'pack-1', packTitle: 'Pack One', playerCount: 3, phase: 'lobby' },
      { roomCode: 'EFGH', packId: 'pack-2', packTitle: 'Pack Two', playerCount: 0, phase: 'question' },
    ]
    mockFetch.mockResolvedValueOnce(makeResponse(rooms))

    const result = await listMyRooms()

    expect(result).toEqual(rooms)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toContain('/rooms/my-rooms')
    expect((init as RequestInit).method).toBe('GET')
  })

  it('attaches the Authorization header when a token is set', async () => {
    setToken('host-tok')
    mockFetch.mockResolvedValueOnce(makeResponse([]))

    await listMyRooms()

    const [, init] = mockFetch.mock.calls[0]
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer host-tok',
    })
  })

  it('refreshes and retries once on a 401', async () => {
    setToken('old-tok')
    mockFetch
      .mockResolvedValueOnce(makeResponse({}, 401))
      .mockResolvedValueOnce(makeResponse({ accessToken: 'new-tok' }))
      .mockResolvedValueOnce(makeResponse([]))

    const result = await listMyRooms()

    expect(result).toEqual([])
    expect(mockFetch).toHaveBeenCalledTimes(3)
    const [retryUrl, retryInit] = mockFetch.mock.calls[2]
    expect(retryUrl).toContain('/rooms/my-rooms')
    expect((retryInit as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer new-tok',
    })
  })

  it('rejects when the network call fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('offline'))

    await expect(listMyRooms()).rejects.toThrow('offline')
  })
})

describe('req — exempt paths skip refresh', () => {
  it('does not attempt refresh when an /auth/ endpoint returns 401', async () => {
    mockFetch.mockResolvedValue(makeResponse({ message: 'Bad credentials' }, 401))

    await expect(login('a@b.com', 'wrong')).rejects.toThrow('Bad credentials')

    // Only one fetch call: the login request itself. No refresh was triggered.
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
