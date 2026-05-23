import { useState, useEffect } from 'react'
import type { RoomStateDto } from '@bar-trivia/shared'
import { getRoom, startGame, kickPlayer, updateRoomConfig } from '../api'

interface Props {
  roomCode: string
  packId: string
  roomState: RoomStateDto | null
  onBack: () => void
}

export default function RoomLobby({ roomCode, roomState: liveState, onBack }: Props) {
  const [polledState, setPolledState] = useState<RoomStateDto | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  // Initial fetch in case socket takes a moment
  useEffect(() => {
    getRoom(roomCode)
      .then(setPolledState)
      .catch(() => {})
  }, [roomCode])

  const state = liveState ?? polledState

  async function handleStart() {
    setStarting(true)
    setError('')
    try {
      await startGame(roomCode)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start game')
      setStarting(false)
    }
    // Navigation to in-game happens via App.tsx watching room:state phase change
  }

  async function handleKick(participantId: string, name: string) {
    if (!confirm(`Kick ${name}?`)) return
    try {
      await kickPlayer(roomCode, participantId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to kick player')
    }
  }

  async function handleLateJoin(policy: 'open' | 'locked') {
    try {
      await updateRoomConfig(roomCode, { lateJoinPolicy: policy })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update config')
    }
  }

  const playerCount = state?.players.length ?? 0

  return (
    <div className="screen">
      <div className="screen-header">
        <button className="btn-icon btn-sm" onClick={onBack}>‹</button>
        <h1 className="screen-title">Lobby</h1>
        <span className="phase-badge phase-lobby">LOBBY</span>
      </div>

      <div className="room-code-display">
        <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
          Players join at
        </div>
        <div className="room-code-value">{roomCode}</div>
        <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
          {playerCount} player{playerCount !== 1 ? 's' : ''} connected
        </div>
      </div>

      {state && (
        <div className="card" style={{ marginBottom: '0.75rem' }}>
          <div className="section-label" style={{ marginBottom: '0.5rem' }}>Game</div>
          <div style={{ fontWeight: 600 }}>{state.packTitle}</div>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>{state.gameTitle}</div>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            {state.totalQuestions} question{state.totalQuestions !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {state && (
        <div className="card" style={{ marginBottom: '0.75rem' }}>
          <div className="section-label" style={{ marginBottom: '0.5rem' }}>Settings</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.9rem' }}>Late join</span>
            <div className="action-row" style={{ margin: 0, gap: '0.5rem' }}>
              <button
                className={`btn-sm ${state.lateJoinPolicy === 'open' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => handleLateJoin('open')}
              >
                Open
              </button>
              <button
                className={`btn-sm ${state.lateJoinPolicy === 'locked' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => handleLateJoin('locked')}
              >
                Locked
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: '0.5rem' }}>
        <div className="section-label" style={{ marginBottom: '0.5rem' }}>
          Players ({playerCount})
        </div>
        {playerCount === 0 ? (
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
            Waiting for players to join with code <strong>{roomCode}</strong>…
          </p>
        ) : (
          state?.players.map((p) => (
            <div key={p.participantId} className="player-row">
              <span className="player-name">{p.displayName}</span>
              <button
                className="btn-sm"
                style={{ background: 'none', color: 'var(--danger)', border: '1px solid var(--danger)', padding: '0.3rem 0.6rem' }}
                onClick={() => handleKick(p.participantId, p.displayName)}
              >
                Kick
              </button>
            </div>
          ))
        )}
      </div>

      {error && <p className="error-msg" style={{ margin: '0.5rem 0' }}>{error}</p>}

      <div className="bottom-actions">
        <button
          className="btn-success"
          disabled={starting || playerCount === 0}
          onClick={handleStart}
          style={{ fontSize: '1.1rem', padding: '1rem' }}
        >
          {starting ? 'Starting…' : `▶ Start Game (${playerCount} player${playerCount !== 1 ? 's' : ''})`}
        </button>
      </div>
    </div>
  )
}
