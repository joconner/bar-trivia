import './tv.css'
import { useEffect, useState } from 'react'
import { useRoomState } from './useRoomState'
import { LobbyView } from './views/LobbyView'
import { QuestionView } from './views/QuestionView'
import { RevealView } from './views/RevealView'
import { FinalView } from './views/FinalView'

// Server URL: same-origin when served by nginx, fallback for local Vite dev.
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? ''
const POLL_INTERVAL_MS = 3000

// Extract roomCode from URL path (/MURP or /tv/MURP) or ?roomCode= query param.
function getRoomCodeFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search)
  const fromQuery = params.get('roomCode')
  if (fromQuery) return fromQuery.toUpperCase()

  const segments = window.location.pathname.split('/').filter(Boolean)
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i].toUpperCase()
    if (/^[A-Z]{2,8}$/.test(seg)) return seg
  }
  return null
}

interface ActiveRoomsResponse {
  count: number
  roomCode: string | null
}

function TVApp({ roomCode }: { roomCode: string }) {
  const { state, connected } = useRoomState(roomCode)

  return (
    <div className="tv-root">
      {!connected && (
        <div className="disconnected-banner">Reconnecting...</div>
      )}
      {!state ? (
        <div className="waiting-screen">
          <h1>{roomCode}</h1>
          <p>Waiting for room...</p>
        </div>
      ) : state.phase === 'lobby' ? (
        <LobbyView state={state} />
      ) : state.phase === 'question' ? (
        <QuestionView state={state} />
      ) : state.phase === 'reveal' ? (
        <RevealView state={state} />
      ) : state.phase === 'final' ? (
        <FinalView state={state} />
      ) : null}
    </div>
  )
}

// Auto-discovers an active room by polling /rooms/active. If a room code is
// already in the URL (manual pairing), that takes priority and skips polling.
function AutoDiscoverApp() {
  const [discovered, setDiscovered] = useState<ActiveRoomsResponse | null>(null)
  const [manualCode, setManualCode] = useState('')

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    async function poll() {
      try {
        const res = await fetch(`${SERVER_URL}/rooms/active`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = (await res.json()) as ActiveRoomsResponse
        if (!cancelled) setDiscovered(body)
      } catch {
        if (!cancelled) setDiscovered({ count: 0, roomCode: null })
      }
      if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS)
    }

    poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [])

  if (discovered?.roomCode) {
    return <TVApp roomCode={discovered.roomCode} />
  }

  if (discovered && discovered.count > 1) {
    return (
      <div className="waiting-screen">
        <h1>Bar Trivia TV</h1>
        <p>Multiple active rooms ({discovered.count}). Enter the room code to pair this TV:</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const code = manualCode.trim().toUpperCase()
            if (code) window.location.pathname = `/${code}`
          }}
          style={{ marginTop: '1.5rem' }}
        >
          <input
            type="text"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="ABCD"
            maxLength={8}
            autoFocus
            style={{ fontSize: '2rem', textAlign: 'center', padding: '0.5rem 1rem', textTransform: 'uppercase', letterSpacing: '0.2em', width: '8em' }}
          />
        </form>
      </div>
    )
  }

  return (
    <div className="waiting-screen">
      <h1>Bar Trivia TV</h1>
      <p>Waiting for host to create a room…</p>
    </div>
  )
}

export default function App() {
  const fromUrl = getRoomCodeFromUrl()
  if (fromUrl) return <TVApp roomCode={fromUrl} />
  return <AutoDiscoverApp />
}
