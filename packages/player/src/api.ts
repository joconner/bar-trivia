// REST API client for the player app.
// All paths are relative so Vite's dev proxy forwards them to the server.
const BASE = ''

export interface JoinResult {
  accessToken: string
  participant: { id: string; displayName: string }
}

export interface RerollResult {
  accessToken: string
  displayName: string
}

export async function apiRefresh(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.accessToken as string
  } catch {
    return null
  }
}

export async function apiJoin(roomCode: string, token?: string): Promise<JoinResult> {
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

export async function apiReroll(roomCode: string, token: string): Promise<RerollResult> {
  const res = await fetch(`${BASE}/rooms/${roomCode}/reroll-name`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to reroll name')
  return res.json()
}

export async function apiSubmitAnswer(
  roomCode: string,
  token: string,
  questionId: string,
  choiceId: string,
): Promise<void> {
  const res = await fetch(`${BASE}/rooms/${roomCode}/answers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    credentials: 'include',
    body: JSON.stringify({ questionId, choiceId }),
  })
  // 409 = already answered; treat as success (idempotent from the client's view)
  if (!res.ok && res.status !== 409) throw new Error('Failed to submit answer')
}

export function decodeToken(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split('.')
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}

export function isTokenExpired(token: string): boolean {
  const p = decodeToken(token)
  if (!p || typeof p['exp'] !== 'number') return true
  return (p['exp'] as number) * 1000 < Date.now()
}
