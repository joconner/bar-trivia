import type { Pack, RoomStateDto } from '@bar-trivia/shared'

const BASE = (import.meta as { env: Record<string, string> }).env.VITE_API_URL ?? 'http://localhost:3000'

let _token: string | null = null

export function setToken(token: string | null) {
  _token = token
}

export function getToken(): string | null {
  return _token
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (_token) headers['Authorization'] = `Bearer ${_token}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 204) return undefined as T

  const data = await res.json().catch(() => ({ message: res.statusText }))

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

export function refreshToken() {
  return req<{ accessToken: string }>('POST', '/auth/refresh')
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

// --- Rooms ---

export function createRoom(packId: string, gameId: string) {
  return req<{ roomCode: string; joinUrl: string }>('POST', '/rooms', { packId, gameId })
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
