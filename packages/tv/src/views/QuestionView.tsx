import type { RoomStateDto } from '@bar-trivia/shared'
import { TimerRing } from '../components/TimerRing'

const CHOICE_LABELS = ['A', 'B', 'C', 'D']
const CHOICE_COLORS = ['#3b82f6', '#f97316', '#22c55e', '#a855f7']

interface QuestionViewProps {
  state: RoomStateDto
}

export function QuestionView({ state }: QuestionViewProps) {
  const q = state.currentQuestion!
  const qIndex = state.currentQuestionIndex ?? 0

  return (
    <div className="question-view">
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
            {q.choices.map((choice, i) => (
              <div
                key={choice.id}
                className="choice-tile"
                style={{ backgroundColor: CHOICE_COLORS[i] }}
              >
                <span className="choice-label">{CHOICE_LABELS[i]}</span>
                <span className="choice-text">{choice.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="question-sidebar">
          <TimerRing
            timerEndsAt={q.timerEndsAt}
            isPaused={q.isPaused}
            pausedRemainingMs={q.pausedRemainingMs}
          />
          <div className="mini-leaderboard">
            <h3>Leaderboard</h3>
            <ol className="mini-lb-list">
              {state.leaderboard.slice(0, 5).map((entry) => (
                <li key={entry.participantId} className="mini-lb-entry">
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
