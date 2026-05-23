import { usePlayer } from '../PlayerContext'

export function RevealPage() {
  const { roomState, participantId, submittedAnswers } = usePlayer()
  const q = roomState?.currentQuestion

  if (!q) {
    return (
      <div style={styles.page}>
        <p style={styles.waiting}>Loading result&hellip;</p>
      </div>
    )
  }

  const correctChoiceId = q.correctChoiceId
  const correctChoice = q.choices.find((c) => c.id === correctChoiceId)
  const myChoiceId = submittedAnswers[q.questionId]
  const isCorrect = myChoiceId != null && myChoiceId === correctChoiceId
  const didAnswer = myChoiceId != null

  const me = participantId
    ? roomState?.leaderboard.find((e) => e.participantId === participantId)
    : undefined

  const rankLabel =
    me?.rank === 1 ? '1st' :
    me?.rank === 2 ? '2nd' :
    me?.rank === 3 ? '3rd' :
    me?.rank != null ? `${me.rank}th` : null

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {!didAnswer ? (
          <p style={styles.noAnswer}>You didn&apos;t answer in time</p>
        ) : isCorrect ? (
          <div style={styles.resultBlock}>
            <span style={styles.resultEmoji}>&#9989;</span>
            <p style={styles.resultText}>Correct!</p>
          </div>
        ) : (
          <div style={styles.resultBlock}>
            <span style={styles.resultEmoji}>&#10060;</span>
            <p style={styles.resultText}>Wrong</p>
          </div>
        )}

        {correctChoice && (
          <div style={styles.answerBox}>
            <p style={styles.answerLabel}>Correct answer</p>
            <p style={styles.answerText}>{correctChoice.text}</p>
          </div>
        )}

        {me && (
          <div style={styles.scoreRow}>
            <div style={styles.scoreItem}>
              <p style={styles.scoreLabel}>Score</p>
              <p style={styles.scoreValue}>{me.score}</p>
            </div>
            {rankLabel && (
              <div style={styles.scoreItem}>
                <p style={styles.scoreLabel}>Rank</p>
                <p style={styles.scoreValue}>{rankLabel}</p>
              </div>
            )}
          </div>
        )}

        <p style={styles.hint}>Waiting for the host&hellip;</p>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#111827',
    padding: '1rem',
  } as React.CSSProperties,
  waiting: {
    color: '#9CA3AF',
    fontSize: '1.125rem',
    margin: 0,
  } as React.CSSProperties,
  card: {
    width: '100%',
    maxWidth: '360px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '1.25rem',
    textAlign: 'center' as const,
  } as React.CSSProperties,
  noAnswer: {
    color: '#9CA3AF',
    fontSize: '1.25rem',
    margin: 0,
  } as React.CSSProperties,
  resultBlock: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '0.5rem',
  } as React.CSSProperties,
  resultEmoji: {
    fontSize: '3rem',
    lineHeight: 1,
  } as React.CSSProperties,
  resultText: {
    fontSize: '1.75rem',
    fontWeight: 700,
    color: '#F9FAFB',
    margin: 0,
  } as React.CSSProperties,
  answerBox: {
    background: '#1F2937',
    borderRadius: '0.75rem',
    padding: '0.875rem 1.25rem',
    width: '100%',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  answerLabel: {
    color: '#9CA3AF',
    fontSize: '0.8rem',
    margin: '0 0 0.25rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  } as React.CSSProperties,
  answerText: {
    color: '#F9FAFB',
    fontSize: '1.1rem',
    fontWeight: 600,
    margin: 0,
  } as React.CSSProperties,
  scoreRow: {
    display: 'flex',
    gap: '2rem',
    justifyContent: 'center',
  } as React.CSSProperties,
  scoreItem: {
    textAlign: 'center' as const,
  } as React.CSSProperties,
  scoreLabel: {
    color: '#9CA3AF',
    fontSize: '0.8rem',
    margin: '0 0 0.25rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  } as React.CSSProperties,
  scoreValue: {
    color: '#F9FAFB',
    fontSize: '1.75rem',
    fontWeight: 800,
    margin: 0,
  } as React.CSSProperties,
  hint: {
    color: '#4B5563',
    fontSize: '0.8rem',
    margin: 0,
  } as React.CSSProperties,
}
