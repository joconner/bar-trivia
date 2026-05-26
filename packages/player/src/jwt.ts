// Minimal client-side JWT helpers. We never trust these for authz — they only
// let the client decide when to proactively refresh and which view to show.

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
