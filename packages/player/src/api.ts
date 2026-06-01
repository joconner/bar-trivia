// REST API client for the player app.
// Paths are relative in same-origin deploys; set VITE_API_URL at build time
// when the frontend is hosted separately (e.g. Cloudflare Pages + Railway).
import { getAccessToken, refreshAccessToken } from './token-store'

const BASE = import.meta.env.VITE_API_URL ?? ''

export interface JoinResult {
  accessToken: string
  participant: { id: string; displayName: string }
}

export interface RerollResult {
  accessToken: string
  displayName: string
}

// Attaches the current access token and, on a 401, performs one shared refresh
// and retries the request once. Auth endpoints are exempt so a bad-credentials
// 401 never loops through refresh.
async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const withAuth = (token: string | null): RequestInit => {
    const headers = new Headers(init.headers)
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return { ...init, headers, credentials: 'include' }
  }

  let res = await fetch(`${BASE}${path}`, withAuth(getAccessToken()))
  if (res.status === 401 && !path.startsWith('/auth/')) {
    const refreshed = await refreshAccessToken()
    if (refreshed) res = await fetch(`${BASE}${path}`, withAuth(refreshed))
  }
  return res
}

export async function apiJoin(roomCode: string, token?: string): Promise<JoinResult> {
  // Join is a public endpoint: an expired token is treated as a fresh guest by
  // the server, so we pass it through as-is rather than via authedFetch.
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}/rooms/${roomCode}/join`, {
    method: 'POST',
    headers,
    credentials: 'include',
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { message?: string }).message ?? `Join failed: ${res.status}`)
  }
  return res.json()
}

export async function apiReroll(roomCode: string): Promise<RerollResult> {
  const res = await authedFetch(`/rooms/${roomCode}/reroll-name`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to reroll name')
  return res.json()
}

export async function apiSubmitAnswer(
  roomCode: string,
  questionId: string,
  choiceId: string,
): Promise<void> {
  const res = await authedFetch(`/rooms/${roomCode}/answers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionId, choiceId }),
  })
  // 409 = already answered; treat as success (idempotent from the client's view)
  if (!res.ok && res.status !== 409) throw new Error('Failed to submit answer')
}
