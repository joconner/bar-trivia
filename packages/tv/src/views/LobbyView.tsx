import { QRCodeSVG } from 'qrcode.react'
import type { RoomStateDto } from '@bar-trivia/shared'

const PLAYER_URL = import.meta.env.VITE_PLAYER_URL ?? 'http://localhost:5174'

interface LobbyViewProps {
  state: RoomStateDto
}

export function LobbyView({ state }: LobbyViewProps) {
  const joinUrl = `${PLAYER_URL}/join/${state.roomCode}`

  return (
    <div className="lobby-view">
      <h1 className="game-title">{state.gameTitle}</h1>
      <p className="pack-title">{state.packTitle}</p>

      <div className="lobby-main">
        <div className="join-section">
          <p className="join-label">Join the game!</p>
          <div className="room-code">{state.roomCode}</div>
          <div className="qr-wrapper">
            <QRCodeSVG value={joinUrl} size={200} bgColor="#ffffff" fgColor="#0f172a" level="M" />
          </div>
          <p className="join-url">{joinUrl}</p>
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
