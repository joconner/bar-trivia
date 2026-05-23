import { useState } from 'react'
import type { RoomStateDto, Pack } from '@bar-trivia/shared'
import { selectGame, getPack } from '../api'

const MEDALS = ['🥇', '🥈', '🥉']

interface Props {
  roomCode: string
  packId: string
  roomState: RoomStateDto | null
  onBackToPacks: () => void
  onNextGame: (gameId: string) => void
}

export default function Final({ roomCode, packId, roomState, onBackToPacks, onNextGame }: Props) {
  const [showNextGame, setShowNextGame] = useState(false)
  const [pack, setPack] = useState<Pack | null>(null)
  const [loadingPack, setLoadingPack] = useState(false)
  const [selecting, setSelecting] = useState<string | null>(null)
  const [error, setError] = useState('')

  const state = roomState

  async function handleShowNextGame() {
    setShowNextGame(true)
    if (!pack) {
      setLoadingPack(true)
      getPack(packId)
        .then(setPack)
        .catch((err) => setError(err.message))
        .finally(() => setLoadingPack(false))
    }
  }

  async function handleSelectGame(gameId: string) {
    setSelecting(gameId)
    setError('')
    try {
      await selectGame(roomCode, gameId)
      onNextGame(gameId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select game')
      setSelecting(null)
    }
  }

  const leaderboard = state?.leaderboard ?? []
  const podium = state?.finalPodium ?? []

  return (
    <div className="screen">
      <div className="screen-header">
        <h1 className="screen-title">Game Over!</h1>
        <span className="phase-badge phase-final">FINAL</span>
      </div>

      {podium.length > 0 && (
        <div
          style={{
            background: 'var(--surface)',
            border: '1.5px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '1rem',
            marginBottom: '1rem',
            textAlign: 'center',
          }}
        >
          <div className="section-label" style={{ marginBottom: '0.75rem' }}>Podium</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            {podium.map((entry) => (
              <div key={entry.participantId} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem' }}>{MEDALS[entry.rank - 1]}</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', maxWidth: '80px', wordBreak: 'break-word' }}>
                  {entry.displayName}
                </div>
                <div style={{ color: 'var(--accent2)', fontWeight: 600, fontSize: '0.85rem' }}>
                  {entry.score} pts
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section-label" style={{ marginBottom: '0.5rem' }}>Full Leaderboard</div>
      <div className="screen-body">
        {leaderboard.length === 0 ? (
          <p style={{ color: 'var(--text-dim)' }}>No scores recorded.</p>
        ) : (
          leaderboard.map((entry) => (
            <div key={entry.participantId} className="leaderboard-entry">
              <div className={`leaderboard-rank rank-${entry.rank}`}>{entry.rank}</div>
              <div style={{ flex: 1, fontWeight: 500 }}>{entry.displayName}</div>
              <div className="player-score">{entry.score} pts</div>
            </div>
          ))
        )}
      </div>

      {error && <p className="error-msg" style={{ margin: '0.5rem 0' }}>{error}</p>}

      {showNextGame ? (
        <div style={{ marginTop: '1rem' }}>
          <div className="section-label" style={{ marginBottom: '0.5rem' }}>Choose next game</div>
          {loadingPack && <p className="loading">Loading games…</p>}
          {pack?.games.map((game) => (
            <div key={game.id} className="card card-clickable" onClick={() => handleSelectGame(game.id)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{game.title}</div>
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                    {game.questions.length} question{game.questions.length !== 1 ? 's' : ''}
                  </div>
                </div>
                {selecting === game.id ? (
                  <span style={{ color: 'var(--text-dim)' }}>…</span>
                ) : (
                  <span style={{ color: 'var(--text-dim)' }}>›</span>
                )}
              </div>
            </div>
          ))}
          <button className="btn-secondary" style={{ marginTop: '0.5rem' }} onClick={() => setShowNextGame(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="bottom-actions">
          <button className="btn-primary" onClick={handleShowNextGame}>
            ▶ Play Another Game
          </button>
          <button className="btn-secondary" onClick={onBackToPacks}>
            End Session
          </button>
        </div>
      )}
    </div>
  )
}
