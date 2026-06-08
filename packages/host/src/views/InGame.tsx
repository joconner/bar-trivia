import { useState, useEffect, useRef } from 'react'
import type { RoomStateDto } from '@bar-trivia/shared'
import { pauseGame, advanceGame, kickPlayer, updateRoomSettings } from '../api'

const LETTERS = ['A', 'B', 'C', 'D']

interface Props {
  roomCode: string
  roomState: RoomStateDto | null
  onDone: () => void
}

function useTimer(state: RoomStateDto | null): { remaining: number; paused: boolean } {
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    const q = state?.currentQuestion
    if (!q) { setRemaining(0); return }

    if (q.isPaused) {
      setRemaining(Math.max(0, Math.round((q.pausedRemainingMs ?? 0) / 1000)))
      return
    }

    if (!q.timerEndsAt) { setRemaining(0); return }

    function tick() {
      const endsAt = new Date(q!.timerEndsAt!).getTime()
      const diff = Math.max(0, Math.round((endsAt - Date.now()) / 1000))
      setRemaining(diff)
    }

    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [state?.currentQuestion?.timerEndsAt, state?.currentQuestion?.isPaused, state?.currentQuestion?.pausedRemainingMs])

  return { remaining, paused: state?.currentQuestion?.isPaused ?? false }
}

export default function InGame({ roomCode, roomState, onDone }: Props) {
  const [error, setError] = useState('')
  const [acting, setActing] = useState<'pause' | 'advance' | 'autoAdvance' | null>(null)
  const [showRoster, setShowRoster] = useState(false)
  const prevPhase = useRef(roomState?.phase)
  const { remaining, paused } = useTimer(roomState)
  const autoAdvance = roomState?.autoAdvance ?? false

  useEffect(() => {
    if (roomState?.phase === 'final' && prevPhase.current !== 'final') {
      onDone()
    }
    prevPhase.current = roomState?.phase
  }, [roomState?.phase, onDone])

  async function handlePause() {
    setActing('pause')
    setError('')
    try {
      await pauseGame(roomCode)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pause')
    } finally {
      setActing(null)
    }
  }

  async function handleAdvance() {
    setActing('advance')
    setError('')
    try {
      await advanceGame(roomCode)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to advance')
    } finally {
      setActing(null)
    }
  }

  async function handleToggleAutoAdvance() {
    setActing('autoAdvance')
    setError('')
    try {
      await updateRoomSettings(roomCode, { autoAdvance: !autoAdvance })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings')
    } finally {
      setActing(null)
    }
  }

  async function handleKick(participantId: string, name: string) {
    if (!confirm(`Kick ${name}?`)) return
    try {
      await kickPlayer(roomCode, participantId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to kick player')
    }
  }

  const state = roomState
  const q = state?.currentQuestion
  const phase = state?.phase ?? 'question'
  const isReveal = phase === 'reveal'
  const qIndex = (state?.currentQuestionIndex ?? 0) + 1
  const total = state?.totalQuestions ?? 0

  if (!state) {
    return (
      <div className="screen">
        <p className="loading">Connecting…</p>
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span
            className={`phase-badge ${isReveal ? 'phase-reveal' : 'phase-question'}`}
            style={{ margin: 0 }}
          >
            {isReveal ? 'REVEAL' : 'LIVE'}
          </span>
          <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
            Q{qIndex}/{total}
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <button
          className="btn-icon btn-sm"
          onClick={() => setShowRoster((v) => !v)}
          style={{ position: 'relative' }}
        >
          👥 {state.players.length}
        </button>
      </div>

      {showRoster ? (
        <div className="screen-body">
          <div className="section-label" style={{ marginBottom: '0.5rem' }}>Players</div>
          {state.players.map((p) => (
            <div key={p.participantId} className="player-row">
              <span className="player-name">{p.displayName}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span className="player-score">{p.score} pts</span>
                <button
                  className="btn-sm"
                  style={{ background: 'none', color: 'var(--danger)', border: '1px solid var(--danger)', padding: '0.3rem 0.6rem' }}
                  onClick={() => handleKick(p.participantId, p.displayName)}
                >
                  Kick
                </button>
              </div>
            </div>
          ))}
          <button className="btn-secondary" style={{ marginTop: '1rem' }} onClick={() => setShowRoster(false)}>
            Back to question
          </button>
        </div>
      ) : (
        <div className="screen-body">
          <div
            className={`timer-display${paused ? ' timer-paused' : ''}`}
          >
            {paused ? `⏸ ${remaining}s` : `${remaining}s`}
          </div>

          {q ? (
            <>
              {q.imageUrl && (
                <img
                  src={q.imageUrl}
                  alt="Question"
                  style={{ width: '100%', borderRadius: 'var(--radius)', marginBottom: '0.75rem', maxHeight: '160px', objectFit: 'cover' }}
                />
              )}

              <div
                style={{
                  background: 'var(--surface)',
                  border: '1.5px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '1rem',
                  marginBottom: '0.75rem',
                  fontSize: '1.05rem',
                  fontWeight: 600,
                  lineHeight: 1.4,
                }}
              >
                {q.prompt}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {q.choices.map((choice, idx) => {
                  const isCorrect = isReveal && choice.id === q.correctChoiceId
                  const count = isReveal ? (q.answerBreakdown?.[choice.id] ?? 0) : null
                  return (
                    <div
                      key={choice.id}
                      className={`choice-row${isCorrect ? ' is-correct' : ''}`}
                      style={{ padding: '0.5rem 0.75rem' }}
                    >
                      <div className={`choice-letter${isCorrect ? ' correct' : ''}`}>
                        {isCorrect ? '✓' : LETTERS[idx]}
                      </div>
                      <span style={{ flex: 1, fontSize: '0.9rem' }}>{choice.text}</span>
                      {count !== null && (
                        <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem', fontWeight: 600 }}>
                          {count}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="empty-state">Waiting for question…</div>
          )}
        </div>
      )}

      {error && <p className="error-msg" style={{ margin: '0.5rem 0' }}>{error}</p>}

      {!showRoster && (
        <div className="bottom-actions">
          <div
            className="action-row"
            style={{ justifyContent: 'space-between', marginBottom: '0.5rem' }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.85rem',
                color: 'var(--text-dim)',
                cursor: acting !== null ? 'not-allowed' : 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={autoAdvance}
                disabled={acting !== null}
                onChange={handleToggleAutoAdvance}
              />
              <span>
                Auto-advance
                {isReveal && autoAdvance && remaining > 0 ? ` · next in ${remaining}s` : ''}
              </span>
            </label>
          </div>
          <div className="action-row">
            <button
              className="btn-secondary"
              disabled={acting !== null}
              onClick={handlePause}
              style={{ fontSize: '1rem' }}
            >
              {paused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button
              className="btn-primary"
              disabled={acting !== null}
              onClick={handleAdvance}
              style={{ fontSize: '1rem' }}
            >
              {acting === 'advance' ? 'Advancing…' : isReveal ? '⏭ Next Q' : '⏭ Reveal'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
