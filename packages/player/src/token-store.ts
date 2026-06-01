import { decodeToken } from './jwt'

// Single source of truth for the access token, shared by the REST layer and the
// socket. Refreshes are single-flight so the socket's connect_error handler, a
// REST 401 retry, the proactive timer, and React StrictMode's double-mount can
// never rotate the same refresh cookie twice and trip server reuse detection.

const REFRESH_PATH = `${import.meta.env.VITE_API_URL ?? ''}/auth/refresh`
const PROACTIVE_LEAD_MS = 90_000

let accessToken: string | null = null
let refreshInFlight: Promise<string | null> | null = null
let proactiveTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<(token: string | null) => void>()

export function getAccessToken(): string | null {
  return accessToken
}

export function subscribe(listener: (token: string | null) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setAccessToken(token: string | null): void {
  accessToken = token
  scheduleProactiveRefresh(token)
  for (const listener of listeners) listener(token)
}

export function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = (async () => {
    try {
      const res = await fetch(REFRESH_PATH, { method: 'POST', credentials: 'include' })
      if (!res.ok) return null
      const data = (await res.json()) as { accessToken: string }
      setAccessToken(data.accessToken)
      return data.accessToken
    } catch {
      return null
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

function scheduleProactiveRefresh(token: string | null): void {
  if (proactiveTimer) {
    clearTimeout(proactiveTimer)
    proactiveTimer = null
  }
  if (!token) return
  const claims = decodeToken(token)
  const exp = typeof claims?.['exp'] === 'number' ? (claims['exp'] as number) * 1000 : 0
  if (!exp) return
  const delay = Math.max(0, exp - Date.now() - PROACTIVE_LEAD_MS)
  proactiveTimer = setTimeout(() => {
    void refreshAccessToken()
  }, delay)
}
