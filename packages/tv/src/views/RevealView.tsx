import type { RoomStateDto } from '@bar-trivia/shared'

const CHOICE_LABELS = ['A', 'B', 'C', 'D']
const CHOICE_COLORS = ['#3b82f6', '#f97316', '#22c55e', '#a855f7']

interface RevealViewProps {
  state: RoomStateDto
}

export function RevealView({ state }: RevealViewProps) {
  const q = state.currentQuestion!
  const correctId = q.correctChoiceId
  const breakdown = q.answerBreakdown ?? {}
  const totalAnswers = Object.values(breakdown).reduce((sum, n) => sum + n, 0)
  const qIndex = state.currentQuestionIndex ?? 0

  return (
    <div className="reveal-view">
      <div className="question-header">
        <span className="question-counter">
          {qIndex + 1} / {state.totalQuestions}
        </span>
        <span className="pack-title">{state.packTitle}</span>
      </div>

      <div className="question-body">
        <div className="question-main">
          {q.imageUrl && (
            <div className="question-image-wrapper">
              <img src={q.imageUrl} alt="Question" className="question-image" />
            </div>
          )}
          <p className="question-prompt">{q.prompt}</p>
          <div className="choices-grid">
            {q.choices.map((choice, i) => {
              const isCorrect = choice.id === correctId
              const count = breakdown[choice.id] ?? 0
              const pct = totalAnswers > 0 ? Math.round((count / totalAnswers) * 100) : 0

              return (
                <div
                  key={choice.id}
                  className={`choice-tile reveal${isCorrect ? ' correct' : ' wrong'}`}
                  style={{
                    backgroundColor: isCorrect ? CHOICE_COLORS[i] : '#374151',
                    opacity: isCorrect ? 1 : 0.5,
                  }}
                >
                  <span className="choice-label">{CHOICE_LABELS[i]}</span>
                  <span className="choice-text">{choice.text}</span>
                  {isCorrect && <span className="correct-badge">CORRECT</span>}
                  <div className="answer-bar-wrapper">
                    <div
                      className="answer-bar"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: isCorrect ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.2)',
                      }}
                    />
                    <span className="answer-bar-pct">{pct}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="question-sidebar">
          <div className="reveal-leaderboard">
            <h3>Leaderboard</h3>
            <ol className="mini-lb-list">
              {state.leaderboard.slice(0, 8).map((entry) => (
                <li key={entry.participantId} className="mini-lb-entry">
                  <span className="mini-lb-rank">#{entry.rank}</span>
                  <span className="mini-lb-name">{entry.displayName}</span>
                  <span className="mini-lb-score">{entry.score}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
