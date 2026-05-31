import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock token-store before importing api so the module sees the mock from the start.
vi.mock('../../src/token-store', () => ({
  getAccessToken: vi.fn().mockReturnValue('initial-token'),
  refreshAccessToken: vi.fn().mockResolvedValue('refreshed-token'),
  setAccessToken: vi.fn(),
  subscribe: vi.fn().mockReturnValue(() => {}),
}))

import { apiReroll, apiSubmitAnswer } from '../../src/api'
import { getAccessToken, refreshAccessToken } from '../../src/token-store'

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
  vi.mocked(getAccessToken).mockReset().mockReturnValue('initial-token')
  vi.mocked(refreshAccessToken).mockReset().mockResolvedValue('refreshed-token')
  mockFetch.mockReset()
})

describe('authedFetch — 401 retry', () => {
  it('triggers a token refresh and retries the request after a 401', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse({}, 401))
      .mockResolvedValueOnce(makeResponse({ displayName: 'Otter', accessToken: 'new' }))

    await apiReroll('ABC')

    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('sends the refreshed token as Authorization in the retry request', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse({}, 401))
      .mockResolvedValueOnce(makeResponse({ displayName: 'Otter', accessToken: 'new' }))

    await apiReroll('ABC')

    const [, retryInit] = mockFetch.mock.calls[1]
    const headers = new Headers((retryInit as RequestInit).headers)
    expect(headers.get('Authorization')).toBe('Bearer refreshed-token')
  })

  it('does not call refresh when the initial request succeeds', async () => {
    mockFetch.mockResolvedValue(makeResponse({ displayName: 'Otter', accessToken: 'new' }))

    await apiReroll('ABC')

    expect(refreshAccessToken).not.toHaveBeenCalled()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('does not retry if refreshAccessToken returns null', async () => {
    vi.mocked(refreshAccessToken).mockResolvedValue(null)
    mockFetch.mockResolvedValue(makeResponse({}, 401))

    // apiReroll's authedFetch won't retry when refresh returns null, but the
    // outer function checks res.ok so it throws.
    await expect(apiReroll('ABC')).rejects.toThrow()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})

describe('authedFetch — includes current token on initial request', () => {
  it('attaches Authorization header from the token store', async () => {
    vi.mocked(getAccessToken).mockReturnValue('my-token')
    mockFetch.mockResolvedValue(makeResponse({ displayName: 'X', accessToken: 'new' }))

    await apiReroll('ABC')

    const [, init] = mockFetch.mock.calls[0]
    const headers = new Headers((init as RequestInit).headers)
    expect(headers.get('Authorization')).toBe('Bearer my-token')
  })
})

describe('apiSubmitAnswer', () => {
  it('resolves without error on a 409 (already answered — idempotent)', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 409))
    await expect(apiSubmitAnswer('ABC', 'q1', 'c1')).resolves.toBeUndefined()
  })

  it('throws on a 500 error', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 500))
    await expect(apiSubmitAnswer('ABC', 'q1', 'c1')).rejects.toThrow()
  })

  it('submits questionId and choiceId in the request body', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 200))
    await apiSubmitAnswer('ROOM1', 'q42', 'c3')

    const [, init] = mockFetch.mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toEqual({ questionId: 'q42', choiceId: 'c3' })
  })
})
