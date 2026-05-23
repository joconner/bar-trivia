import { useState, useEffect, FormEvent } from 'react'
import type { Pack, Game } from '@bar-trivia/shared'
import { getPack, createRoom, addGame, deleteGame, deleteQuestion } from '../api'

interface Props {
  packId: string
  onBack: () => void
  onAddQuestion: (gameId: string, questionId?: string) => void
  onStartRoom: (roomCode: string) => void
}

export default function PackDetail({ packId, onBack, onAddQuestion, onStartRoom }: Props) {
  const [pack, setPack] = useState<Pack | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [startingRoom, setStartingRoom] = useState<string | null>(null)
  const [showNewGame, setShowNewGame] = useState(false)
  const [newGameTitle, setNewGameTitle] = useState('')
  const [addingGame, setAddingGame] = useState(false)
  const [addGameError, setAddGameError] = useState('')
  const [expandedGame, setExpandedGame] = useState<string | null>(null)

  useEffect(() => {
    reload()
  }, [packId])

  function reload() {
    setLoading(true)
    getPack(packId)
      .then((p) => {
        setPack(p)
        if (p.games.length > 0 && !expandedGame) {
          setExpandedGame(p.games[0].id)
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  async function handleStartRoom(game: Game) {
    if (!pack) return
    setStartingRoom(game.id)
    try {
      const { roomCode } = await createRoom(pack.id, game.id)
      onStartRoom(roomCode)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room')
    } finally {
      setStartingRoom(null)
    }
  }

  async function handleAddGame(e: FormEvent) {
    e.preventDefault()
    if (!newGameTitle.trim()) return
    setAddingGame(true)
    setAddGameError('')
    try {
      const updated = await addGame(packId, { title: newGameTitle.trim() })
      setPack(updated)
      setNewGameTitle('')
      setShowNewGame(false)
      if (updated.games.length > 0) {
        setExpandedGame(updated.games[updated.games.length - 1].id)
      }
    } catch (err) {
      setAddGameError(err instanceof Error ? err.message : 'Failed to add game')
    } finally {
      setAddingGame(false)
    }
  }

  async function handleDeleteGame(gameId: string) {
    if (!confirm('Delete this game and all its questions?')) return
    try {
      await deleteGame(packId, gameId)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete game')
    }
  }

  async function handleDeleteQuestion(gameId: string, questionId: string) {
    if (!confirm('Delete this question?')) return
    try {
      await deleteQuestion(packId, gameId, questionId)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete question')
    }
  }

  if (loading) return <div className="screen"><p className="loading">Loading…</p></div>
  if (!pack) return <div className="screen"><p className="error-msg">{error || 'Pack not found'}</p></div>

  return (
    <div className="screen">
      <div className="screen-header">
        <button className="btn-icon btn-sm" onClick={onBack}>‹</button>
        <h1 className="screen-title">{pack.title}</h1>
      </div>

      {error && <p className="error-msg" style={{ marginBottom: '0.75rem' }}>{error}</p>}

      <div className="screen-body">
        {pack.games.length === 0 && (
          <div className="empty-state">
            <p style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>🎮</p>
            <p>No games yet. Add a game to get started.</p>
          </div>
        )}

        {pack.games.map((game) => {
          const isExpanded = expandedGame === game.id
          return (
            <div key={game.id} className="card">
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                onClick={() => setExpandedGame(isExpanded ? null : game.id)}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{game.title}</div>
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                    {game.questions.length} question{game.questions.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <span style={{ color: 'var(--text-dim)' }}>{isExpanded ? '▲' : '▼'}</span>
              </div>

              {isExpanded && (
                <div style={{ marginTop: '0.75rem' }}>
                  <hr className="divider" style={{ margin: '0.5rem 0 0.75rem' }} />

                  {game.questions.map((q, idx) => (
                    <div key={q.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem', paddingTop: '2px', minWidth: '1.5rem' }}>
                        {idx + 1}.
                      </span>
                      <div
                        style={{ flex: 1, cursor: 'pointer', fontSize: '0.9rem' }}
                        onClick={() => onAddQuestion(game.id, q.id)}
                      >
                        <div style={{ fontWeight: 500 }}>{q.prompt}</div>
                        <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                          {q.defaultTimerSeconds}s
                          {q.imageUrl ? ' · has image' : ''}
                        </div>
                      </div>
                      <button
                        className="btn-icon btn-sm"
                        style={{ color: 'var(--danger)', border: 'none', background: 'none', padding: '0.25rem' }}
                        onClick={() => handleDeleteQuestion(game.id, q.id)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  <div className="action-row" style={{ marginTop: '0.75rem' }}>
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => onAddQuestion(game.id)}
                    >
                      + Question
                    </button>
                    <button
                      className="btn-success btn-sm"
                      disabled={game.questions.length === 0 || startingRoom === game.id}
                      onClick={() => handleStartRoom(game)}
                    >
                      {startingRoom === game.id ? 'Starting…' : '▶ Start Room'}
                    </button>
                  </div>

                  <button
                    style={{ marginTop: '0.5rem', background: 'none', color: 'var(--danger)', fontSize: '0.8rem', width: 'auto', padding: '0.25rem 0' }}
                    onClick={() => handleDeleteGame(game.id)}
                  >
                    Delete game
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="bottom-actions">
        {showNewGame ? (
          <form onSubmit={handleAddGame}>
            <div className="field">
              <label htmlFor="gameTitle">Game title</label>
              <input
                id="gameTitle"
                type="text"
                value={newGameTitle}
                onChange={(e) => setNewGameTitle(e.target.value)}
                placeholder="e.g. Round 1 - Pop Music"
                autoFocus
                maxLength={100}
              />
            </div>
            {addGameError && <p className="error-msg" style={{ marginBottom: '0.5rem' }}>{addGameError}</p>}
            <div className="action-row">
              <button type="button" className="btn-secondary" onClick={() => setShowNewGame(false)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={addingGame || !newGameTitle.trim()}>
                {addingGame ? 'Adding…' : 'Add game'}
              </button>
            </div>
          </form>
        ) : (
          <button className="btn-secondary" onClick={() => setShowNewGame(true)}>
            + Add Game
          </button>
        )}
      </div>
    </div>
  )
}
