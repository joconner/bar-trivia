import './tv.css'
import { useRoomState } from './useRoomState'
import { LobbyView } from './views/LobbyView'
import { QuestionView } from './views/QuestionView'
import { RevealView } from './views/RevealView'
import { FinalView } from './views/FinalView'

// Extract roomCode from URL path (/MURP or /tv/MURP) or ?roomCode= query param.
function getRoomCode(): string | null {
  const params = new URLSearchParams(window.location.search)
  const fromQuery = params.get('roomCode')
  if (fromQuery) return fromQuery.toUpperCase()

  const segments = window.location.pathname.split('/').filter(Boolean)
  // Last non-empty segment that looks like a room code (2-8 uppercase letters)
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i].toUpperCase()
    if (/^[A-Z]{2,8}$/.test(seg)) return seg
  }
  return null
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

export default function App() {
  const roomCode = getRoomCode()

  if (!roomCode) {
    return (
      <div className="waiting-screen">
        <h1>Bar Trivia TV</h1>
        <p>Open this page with a room code: <code>/XXXX</code> or <code>?roomCode=XXXX</code></p>
      </div>
    )
  }

  return <TVApp roomCode={roomCode} />
}
