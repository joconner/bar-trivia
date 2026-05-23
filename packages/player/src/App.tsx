import { PlayerProvider, usePlayer } from './PlayerContext'
import { JoinPage } from './pages/JoinPage'
import { LobbyPage } from './pages/LobbyPage'
import { QuestionPage } from './pages/QuestionPage'
import { RevealPage } from './pages/RevealPage'
import { FinalPage } from './pages/FinalPage'

// Extract room code from paths like /join/ROOMCODE or /join
function getRoomCodeFromPath(): string | undefined {
  const m = window.location.pathname.match(/^\/join\/([A-Z0-9]+)$/i)
  return m ? m[1].toUpperCase() : undefined
}

function PlayerApp() {
  const { view, error, clearError } = usePlayer()
  const prefillCode = getRoomCodeFromPath()

  if (view === 'loading') {
    return (
      <div style={loadingStyle}>
        <p style={{ color: '#9CA3AF', margin: 0 }}>Loading&hellip;</p>
      </div>
    )
  }

  if (view === 'join') {
    return <JoinPage prefillCode={prefillCode} />
  }

  return (
    <>
      {error && (
        <div style={toastStyle} onClick={clearError} role="alert">
          {error}
        </div>
      )}
      {view === 'lobby' && <LobbyPage />}
      {view === 'question' && <QuestionPage />}
      {view === 'reveal' && <RevealPage />}
      {view === 'final' && <FinalPage />}
    </>
  )
}

export default function App() {
  return (
    <PlayerProvider>
      <PlayerApp />
    </PlayerProvider>
  )
}

const loadingStyle: React.CSSProperties = {
  minHeight: '100dvh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#111827',
}

const toastStyle: React.CSSProperties = {
  position: 'fixed',
  top: '1rem',
  left: '50%',
  transform: 'translateX(-50%)',
  background: '#991B1B',
  color: '#FEF2F2',
  padding: '0.625rem 1.25rem',
  borderRadius: '0.5rem',
  fontSize: '0.875rem',
  zIndex: 100,
  cursor: 'pointer',
  maxWidth: '90vw',
  textAlign: 'center',
}
