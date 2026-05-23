import { useState, useEffect, FormEvent } from 'react'
import type { Pack } from '@bar-trivia/shared'
import { getPack, addQuestion, updateQuestion } from '../api'

const LETTERS = ['A', 'B', 'C', 'D']

function newId(): string {
  return crypto.randomUUID()
}

interface ChoiceState {
  id: string
  text: string
}

interface Props {
  packId: string
  gameId: string
  questionId?: string
  onBack: () => void
  onSaved: () => void
}

export default function QuestionForm({ packId, gameId, questionId, onBack, onSaved }: Props) {
  const isEditing = Boolean(questionId)

  const [prompt, setPrompt] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [timer, setTimer] = useState(30)
  const [choices, setChoices] = useState<ChoiceState[]>(() => [
    { id: newId(), text: '' },
    { id: newId(), text: '' },
    { id: newId(), text: '' },
    { id: newId(), text: '' },
  ])
  const [correctId, setCorrectId] = useState('')
  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!questionId) return
    getPack(packId)
      .then((pack: Pack) => {
        const game = pack.games.find((g) => g.id === gameId)
        const q = game?.questions.find((q) => q.id === questionId)
        if (!q) return
        setPrompt(q.prompt)
        setImageUrl(q.imageUrl ?? '')
        setTimer(q.defaultTimerSeconds)
        if (q.data.type === 'multiple_choice') {
          setChoices(q.data.choices.map((c) => ({ id: c.id, text: c.text })))
          setCorrectId(q.data.correctChoiceId)
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [packId, gameId, questionId])

  function updateChoice(idx: number, text: string) {
    setChoices((prev) => prev.map((c, i) => (i === idx ? { ...c, text } : c)))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!correctId) { setError('Select the correct answer'); return }
    if (choices.some((c) => !c.text.trim())) { setError('All 4 choices must have text'); return }

    setSaving(true)
    setError('')
    try {
      const body = {
        prompt: prompt.trim(),
        imageUrl: imageUrl.trim() || null,
        data: {
          type: 'multiple_choice' as const,
          choices: choices.map((c) => ({ id: c.id, text: c.text.trim() })),
          correctChoiceId: correctId,
        },
        defaultTimerSeconds: timer,
      }
      if (isEditing && questionId) {
        await updateQuestion(packId, gameId, questionId, body)
      } else {
        await addQuestion(packId, gameId, body)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save question')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="screen"><p className="loading">Loading…</p></div>

  return (
    <div className="screen">
      <div className="screen-header">
        <button className="btn-icon btn-sm" onClick={onBack}>‹</button>
        <h1 className="screen-title">{isEditing ? 'Edit Question' : 'Add Question'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="screen-body">
        <div className="field">
          <label htmlFor="prompt">Question prompt *</label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What is the capital of France?"
            required
            maxLength={1000}
            rows={3}
          />
        </div>

        <div className="field">
          <label htmlFor="imageUrl">Image URL (optional)</label>
          <input
            id="imageUrl"
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://example.com/image.jpg"
          />
        </div>

        <div className="field">
          <label htmlFor="timer">Timer: {timer} seconds</label>
          <input
            id="timer"
            type="range"
            min={5}
            max={120}
            step={5}
            value={timer}
            onChange={(e) => setTimer(Number(e.target.value))}
            style={{ padding: '0.25rem 0' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-dim)', fontSize: '0.75rem' }}>
            <span>5s</span>
            <span>120s</span>
          </div>
        </div>

        <div style={{ marginBottom: 'var(--gap)' }}>
          <div className="section-label" style={{ marginBottom: '0.5rem' }}>
            Choices — tap radio to mark correct
          </div>
          {choices.map((choice, idx) => {
            const isCorrect = choice.id === correctId
            return (
              <div key={choice.id} className={`choice-row${isCorrect ? ' is-correct' : ''}`}>
                <div
                  className={`choice-letter${isCorrect ? ' correct' : ''}`}
                  style={{ cursor: 'pointer', flexShrink: 0 }}
                  onClick={() => setCorrectId(choice.id)}
                  title="Mark as correct"
                >
                  {isCorrect ? '✓' : LETTERS[idx]}
                </div>
                <input
                  type="text"
                  value={choice.text}
                  onChange={(e) => updateChoice(idx, e.target.value)}
                  placeholder={`Choice ${LETTERS[idx]}`}
                  maxLength={300}
                  required
                  style={{ border: 'none', background: 'transparent', padding: '0', flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => setCorrectId(choice.id)}
                  style={{
                    width: 'auto',
                    padding: '0.25rem',
                    background: 'none',
                    color: isCorrect ? 'var(--success)' : 'var(--text-dim)',
                    fontSize: '1rem',
                  }}
                  title="Mark as correct"
                >
                  {isCorrect ? '●' : '○'}
                </button>
              </div>
            )
          })}
        </div>

        {error && <p className="error-msg" style={{ marginBottom: '0.75rem' }}>{error}</p>}

        <div className="action-row">
          <button type="button" className="btn-secondary" onClick={onBack}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving || !prompt.trim() || !correctId}>
            {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Add question'}
          </button>
        </div>
      </form>
    </div>
  )
}
