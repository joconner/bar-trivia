import { usePlayer } from '../PlayerContext'

const LABELS = ['A', 'B', 'C', 'D'] as const

const COLORS: Record<string, { normal: string; dimmed: string }> = {
  A: { normal: '#3B82F6', dimmed: '#1D4ED8' },
  B: { normal: '#F97316', dimmed: '#C2410C' },
  C: { normal: '#22C55E', dimmed: '#15803D' },
  D: { normal: '#A855F7', dimmed: '#7E22CE' },
}

export function QuestionPage() {
  const { roomState, submittedAnswers, submitAnswer } = usePlayer()
  const q = roomState?.currentQuestion
  const phoneTextMode = roomState?.phoneTextMode ?? 'heads_up'

  if (!q) {
    return (
      <div style={styles.page}>
        <p style={styles.waiting}>Get ready&hellip;</p>
      </div>
    )
  }

  const alreadySubmitted = q.questionId in submittedAnswers
  const submittedChoiceId = submittedAnswers[q.questionId]

  function handleChoice(choiceIndex: number) {
    if (alreadySubmitted || !q) return
    const choice = q.choices[choiceIndex]
    if (!choice) return
    void submitAnswer(q.questionId, choice.id)
  }

  return (
    <div style={styles.page}>
      {phoneTextMode === 'full' && (
        <div style={styles.promptBox}>
          <p style={styles.prompt}>{q.prompt}</p>
        </div>
      )}

      <div style={styles.grid}>
        {LABELS.map((label, i) => {
          const choice = q.choices[i]
          const palette = COLORS[label]!
          const isSelected = choice && submittedChoiceId === choice.id
          const locked = alreadySubmitted

          return (
            <button
              key={label}
              disabled={locked || !choice}
              onClick={() => handleChoice(i)}
              type="button"
              aria-label={choice ? `${label}: ${choice.text}` : label}
              style={{
                ...styles.btn,
                background: locked ? palette.dimmed : palette.normal,
                opacity: locked && !isSelected ? 0.45 : 1,
                cursor: locked || !choice ? 'default' : 'pointer',
              }}
            >
              <span style={styles.label}>{label}</span>
              {phoneTextMode === 'full' && choice && (
                <span style={styles.text}>{choice.text}</span>
              )}
              {isSelected && <span style={styles.check}>&#10003;</span>}
            </button>
          )
        })}
      </div>

      {alreadySubmitted && (
        <p style={styles.locked}>Answer locked in!</p>
      )}
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    background: '#111827',
    padding: '1rem',
    gap: '1.25rem',
  } as React.CSSProperties,
  waiting: {
    color: '#9CA3AF',
    fontSize: '1.25rem',
    margin: 0,
  } as React.CSSProperties,
  promptBox: {
    width: '100%',
    maxWidth: '400px',
    background: '#1F2937',
    borderRadius: '0.75rem',
    padding: '1rem 1.25rem',
  } as React.CSSProperties,
  prompt: {
    color: '#F9FAFB',
    fontSize: '1rem',
    margin: 0,
    lineHeight: 1.5,
  } as React.CSSProperties,
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.75rem',
    width: '100%',
    maxWidth: '400px',
  } as React.CSSProperties,
  btn: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.375rem',
    padding: '1.5rem 0.5rem',
    border: 'none',
    borderRadius: '1rem',
    minHeight: '120px',
    transition: 'opacity 0.2s',
    position: 'relative' as const,
  } as React.CSSProperties,
  label: {
    fontSize: '2rem',
    fontWeight: 800,
    color: '#fff',
    lineHeight: 1,
  } as React.CSSProperties,
  text: {
    fontSize: '0.8rem',
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center' as const,
    lineHeight: 1.3,
    maxWidth: '90%',
  } as React.CSSProperties,
  check: {
    position: 'absolute' as const,
    top: '0.5rem',
    right: '0.75rem',
    fontSize: '1.25rem',
    color: '#fff',
  } as React.CSSProperties,
  locked: {
    color: '#9CA3AF',
    fontSize: '0.875rem',
    margin: 0,
  } as React.CSSProperties,
}
