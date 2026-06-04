// Extract roomCode from URL path (/MURP or /tv/MURP) or ?roomCode= query param.
// The 'tv' prefix segment is explicitly skipped so a bare /tv URL falls through
// to auto-discovery instead of treating "TV" as a room code.
//
// Server-generated room codes use [2-9A-Z] minus the confusables O/I/L (see
// rooms.service.ts generateRoomCode), so the regex must accept digits.
export function getRoomCodeFromUrl(href: string): string | null {
  const url = new URL(href)
  const fromQuery = url.searchParams.get('roomCode')
  if (fromQuery) return fromQuery.toUpperCase()

  const segments = url.pathname.split('/').filter(Boolean)
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i].toLowerCase() === 'tv') continue
    const seg = segments[i].toUpperCase()
    if (/^[A-Z0-9]{2,8}$/.test(seg)) return seg
  }
  return null
}

const NON_ROUTABLE_LITERALS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', ''])
export function isNonRoutable(hostname: string): boolean {
  return NON_ROUTABLE_LITERALS.has(hostname) || hostname.endsWith('.localhost')
}
