import type { Pack, RoomStateDto } from '@bar-trivia/shared'
import { decodeToken } from './jwt'

export class SubscriptionRequiredError extends Error {
  constructor(public readonly subscriptionStatus: string) {
    super('Subscription required')
    this.name = 'SubscriptionRequiredError'
  }
}

// Same-origin: nginx proxies /auth, /rooms, /packs, /socket.io to the server.
// A hardcoded localhost:3000 would break the moment the host opens this PWA on
// their phone via the bar's LAN IP — the phone has no port 3000 of its own.
const BASE = ''
const PROACTIVE_LEAD_MS = 90_000

let _token: string | null = null
let _refreshInFlight: Promise<string | null> | null = null
let _proactiveTimer: ReturnType<typeof setTimeout> | null = null

export function setToken(token: string | null) {
  _token = token
  if (_proactiveTimer) {
    clearTimeout(_proactiveTimer)
    _proactiveTimer = null
  }
  if (!token) return
  const claims = decodeToken(token)
  const exp = typeof claims?.['exp'] === 'number' ? (claims['exp'] as number) * 1000 : 0
  if (!exp) return
  const delay = Math.max(0, exp - Date.now() - PROACTIVE_LEAD_MS)
  _proactiveTimer = setTimeout(() => {
    void refreshAccessToken()
  }, delay)
}

export function getToken(): string | null {
  return _token
}

// Single-flight refresh shared by the REST 401 retry, the socket connect_error
// handler, the proactive timer, and the mount check — so concurrent triggers
// can't rotate the refresh cookie twice and trip server reuse detection.
export function refreshAccessToken(): Promise<string | null> {
  if (_refreshInFlight) return _refreshInFlight
  _refreshInFlight = (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
      if (!res.ok) return null
      const data = (await res.json()) as { accessToken: string }
      setToken(data.accessToken)
      return data.accessToken
    } catch {
      return null
    } finally {
      _refreshInFlight = null
    }
  })()
  return _refreshInFlight
}

async function req<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (_token) headers['Authorization'] = `Bearer ${_token}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  // On a 401, refresh once and retry. Auth endpoints are exempt so a
  // bad-credentials 401 never loops through refresh.
  if (res.status === 401 && !retried && !path.startsWith('/auth/')) {
    const fresh = await refreshAccessToken()
    if (fresh) return req<T>(method, path, body, true)
  }

  if (res.status === 204) return undefined as T

  const data = await res.json().catch(() => ({ message: res.statusText }))

  if (res.status === 402) {
    throw new SubscriptionRequiredError(data?.subscriptionStatus ?? 'unknown')
  }

  if (!res.ok) {
    const msg = data?.message ?? `HTTP ${res.status}`
    throw new Error(Array.isArray(msg) ? msg.join(', ') : String(msg))
  }

  return data as T
}

// --- Auth ---

export function login(email: string, password: string) {
  return req<{ accessToken: string }>('POST', '/auth/login', { email, password })
}

export function register(email: string, password: string, displayName: string) {
  return req<{ accessToken: string }>('POST', '/auth/register', { email, password, displayName })
}

export function logout() {
  return req<void>('POST', '/auth/logout')
}

// --- Packs ---

export function listPacks() {
  return req<Pack[]>('GET', '/packs')
}

export function getPack(packId: string) {
  return req<Pack>('GET', `/packs/${packId}`)
}

export function createPack(title: string) {
  return req<Pack>('POST', '/packs', { title })
}

export function updatePack(packId: string, title: string) {
  return req<Pack>('PATCH', `/packs/${packId}`, { title })
}

export function deletePack(packId: string) {
  return req<void>('DELETE', `/packs/${packId}`)
}

// --- Games ---

export interface CreateGameBody {
  title: string
  lateJoinDefault?: 'open' | 'locked'
  tiebreakerMethod?: 'response_time'
  phoneTextMode?: 'heads_up' | 'full'
}

export function addGame(packId: string, body: CreateGameBody) {
  return req<Pack>('POST', `/packs/${packId}/games`, {
    tiebreakerMethod: 'response_time',
    lateJoinDefault: 'open',
    phoneTextMode: 'heads_up',
    ...body,
  })
}

export function updateGame(packId: string, gameId: string, body: Partial<CreateGameBody>) {
  return req<Pack>('PATCH', `/packs/${packId}/games/${gameId}`, body)
}

export function deleteGame(packId: string, gameId: string) {
  return req<void>('DELETE', `/packs/${packId}/games/${gameId}`)
}

// --- Questions ---

export interface ChoiceInput {
  id: string
  text: string
}

export interface CreateQuestionBody {
  prompt: string
  imageUrl?: string | null
  data: {
    type: 'multiple_choice'
    choices: ChoiceInput[]
    correctChoiceId: string
  }
  defaultTimerSeconds?: number
}

export function addQuestion(packId: string, gameId: string, body: CreateQuestionBody) {
  return req<Pack>('POST', `/packs/${packId}/games/${gameId}/questions`, body)
}

export function updateQuestion(packId: string, gameId: string, questionId: string, body: Partial<CreateQuestionBody>) {
  return req<Pack>('PATCH', `/packs/${packId}/games/${gameId}/questions/${questionId}`, body)
}

export function deleteQuestion(packId: string, gameId: string, questionId: string) {
  return req<void>('DELETE', `/packs/${packId}/games/${gameId}/questions/${questionId}`)
}

// --- Subscriptions ---

export function getSubscriptionStatus() {
  return req<{ status: string; trialEndsAt: string | null; isActive: boolean }>('GET', '/subscriptions/status')
}

export function createCheckoutSession(successUrl: string, cancelUrl: string) {
  return req<{ url: string }>('POST', '/subscriptions/checkout', { successUrl, cancelUrl })
}

export function createPortalSession(returnUrl: string) {
  return req<{ url: string }>('POST', '/subscriptions/portal', { returnUrl })
}

// --- Rooms ---

export function createRoom(packId: string, gameId: string) {
  return req<{ roomCode: string }>('POST', '/rooms', { packId, gameId })
}

export function getRoom(roomCode: string) {
  return req<RoomStateDto>('GET', `/rooms/${roomCode}`)
}

export function updateRoomConfig(roomCode: string, config: { lateJoinPolicy?: 'open' | 'locked'; phoneTextMode?: 'heads_up' | 'full' }) {
  return req<RoomStateDto>('PATCH', `/rooms/${roomCode}`, config)
}

export function startGame(roomCode: string) {
  return req<void>('POST', `/rooms/${roomCode}/game/start`)
}

export function selectGame(roomCode: string, gameId: string) {
  return req<void>('POST', `/rooms/${roomCode}/game/select-game`, { gameId })
}

export function pauseGame(roomCode: string) {
  return req<void>('POST', `/rooms/${roomCode}/game/pause`)
}

export function advanceGame(roomCode: string) {
  return req<void>('POST', `/rooms/${roomCode}/game/advance`)
}

export function kickPlayer(roomCode: string, participantId: string) {
  return req<void>('POST', `/rooms/${roomCode}/game/kick`, { participantId })
}
