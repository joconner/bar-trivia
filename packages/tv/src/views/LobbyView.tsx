import { QRCodeSVG } from 'qrcode.react'
import type { RoomStateDto } from '@bar-trivia/shared'

// Player lives at /player on the same origin nginx serves the TV from, so the
// QR uses window.location's origin verbatim. No port, no env var — whatever
// hostname the bar TV typed works for phones on the same Wi-Fi.
//
// Localhost is the one case where this breaks silently: phones can't reach the
// TV's loopback. Detect it and show a warning instead of a useless QR, so the
// venue operator catches the problem before customers do.
const NON_ROUTABLE_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', ''])

interface LobbyViewProps {
  state: RoomStateDto
}

export function LobbyView({ state }: LobbyViewProps) {
  const hostname = window.location.hostname
  const isRoutable = !NON_ROUTABLE_HOSTNAMES.has(hostname)
  const joinUrl = `${window.location.origin}/player/join/${state.roomCode}`

  return (
    <div className="lobby-view">
      <h1 className="game-title">{state.gameTitle}</h1>
      <p className="pack-title">{state.packTitle}</p>

      <div className="lobby-main">
        <div className="join-section">
          <p className="join-label">Join the game!</p>
          <div className="room-code">{state.roomCode}</div>
          {isRoutable ? (
            <>
              <div className="qr-wrapper">
                <QRCodeSVG value={joinUrl} size={200} bgColor="#ffffff" fgColor="#0f172a" level="M" />
              </div>
              <p className="join-url">{joinUrl}</p>
            </>
          ) : (
            <div className="qr-warning" style={{ maxWidth: 360, color: '#fbbf24', textAlign: 'center' }}>
              <p style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                TV is at <code>{hostname}</code> — phones can't reach it.
              </p>
              <p style={{ fontSize: '0.9rem' }}>
                Reopen this TV at <code>http://&lt;your-LAN-IP&gt;/tv/</code><br />
                (run <code>ipconfig getifaddr en0</code> on the host machine).
              </p>
            </div>
          )}
        </div>

        <div className="players-section">
          <h2 className="players-heading">
            Players <span className="player-count">({state.players.length})</span>
          </h2>
          {state.players.length === 0 ? (
            <p className="no-players">Waiting for players...</p>
          ) : (
            <ul className="player-list">
              {state.players.map((p) => (
                <li key={p.participantId} className="player-item">
                  {p.displayName}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="trivia-soon">Trivia starts soon...</p>
    </div>
  )
}
