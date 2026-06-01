// CORS predicate for the demo stack: accept any LAN-shaped origin so that
// `docker compose up` works without re-listing origins when the Mac's LAN IP
// changes between venues. Tighten for production.
//
// Allowed:
//   - no Origin header (curl, server-to-server)
//   - localhost / 127.0.0.1 on any port (with optional http/https scheme)
//   - *.localhost (host.localhost, player.localhost, tv.localhost — used in
//     dev to give each client its own cookie jar)
//   - RFC 1918 private ranges: 10.*, 172.16-31.*, 192.168.*
//   - *.local at arbitrary depth (RFC 6762 mDNS plus tool-generated names
//     like nginx.bar-trivia.orb.local from OrbStack). Safe because .local is
//     reserved for link-local resolution — never routable on the public net.
//   - ALLOWED_ORIGINS env var: comma-separated list of exact origins for
//     production deployments (e.g. https://bar-trivia.pages.dev).
//   - RENDER_EXTERNAL_URL: auto-detected on Render.com.
//   - RAILWAY_PUBLIC_DOMAIN: auto-detected on Railway.app.

const ALLOWED_HOST_REGEX =
  /^(localhost|[A-Za-z0-9-]+\.localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|[A-Za-z0-9.-]+\.local)$/

function extraAllowedOrigins(): string[] {
  const list = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  // Render injects RENDER_EXTERNAL_URL (e.g. https://bar-trivia.onrender.com).
  if (process.env.RENDER_EXTERNAL_URL) list.push(process.env.RENDER_EXTERNAL_URL)
  // Railway injects RAILWAY_PUBLIC_DOMAIN as the bare domain (no scheme).
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    list.push(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`)
  }
  return list
}

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true
  if (extraAllowedOrigins().includes(origin)) return true
  try {
    const { hostname } = new URL(origin)
    return ALLOWED_HOST_REGEX.test(hostname)
  } catch {
    return false
  }
}
